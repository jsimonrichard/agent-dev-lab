import { describe, expect, it } from "bun:test";

import type { InspectorRunSummary, RunEvent, RunViewState, StepNode } from "../view-model/types";
import {
  buildPriorStepTimingIndex,
  graftCopiedWaterfallTiming,
  mergePriorRunTiming,
  retryAnchorMs,
} from "./copied-waterfall-timing";
import { computeSpanWaterfallBar, computeWaterfallScale } from "./workflow-waterfall";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-01T00:00:01.000Z";
const T2 = "2026-01-01T00:00:02.000Z";
const T3 = "2026-01-01T00:00:03.000Z";
const T4 = "2026-01-01T00:00:04.000Z";
const T5 = "2026-01-01T00:00:05.000Z";

function step(id: string, extra: Partial<StepNode> = {}): StepNode {
  return {
    stepId: id,
    parentStepId: null,
    name: id,
    path: [id],
    status: "completed",
    children: [],
    agentEpisodes: [],
    ...extra,
  };
}

function view(steps: StepNode[]): RunViewState {
  return {
    runId: "run-retry",
    workflowId: "wf",
    status: "completed",
    startedAt: T3,
    finishedAt: T5,
    input: null,
    lastSeq: 0,
    steps,
  };
}

function priorEvents(): RunEvent[] {
  return [
    { type: "run_started", runId: "run-prior", runSeq: 1, at: T0 },
    {
      type: "step_started",
      runId: "run-prior",
      runSeq: 2,
      at: T0,
      stepId: "s-a",
      parentStepId: null,
      name: "a",
      path: ["a"],
    },
    {
      type: "step_finished",
      runId: "run-prior",
      runSeq: 3,
      at: T1,
      stepId: "s-a",
      durationMs: 1000,
    },
    {
      type: "step_started",
      runId: "run-prior",
      runSeq: 4,
      at: T1,
      stepId: "s-b",
      parentStepId: null,
      name: "b",
      path: ["b"],
    },
    {
      type: "step_finished",
      runId: "run-prior",
      runSeq: 5,
      at: T3,
      stepId: "s-b",
      durationMs: 2000,
    },
    {
      type: "step_started",
      runId: "run-prior",
      runSeq: 6,
      at: T3,
      stepId: "s-c",
      parentStepId: null,
      name: "c",
      path: ["c"],
    },
    {
      type: "step_finished",
      runId: "run-prior",
      runSeq: 7,
      at: T4,
      stepId: "s-c",
      durationMs: 1000,
    },
    { type: "run_finished", runId: "run-prior", runSeq: 8, at: T4 },
  ];
}

describe("graftCopiedWaterfallTiming", () => {
  it("grafts strict-prefix copied steps relative to the re-exec anchor", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    const state = view([
      step("a", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
        path: ["a"],
      }),
      step("b", {
        startedAt: T3,
        finishedAt: T5,
        durationMs: 2000,
        path: ["b"],
      }),
    ]);

    graftCopiedWaterfallTiming(state, prior);

    const copied = state.steps[0]!;
    expect(copied.displayDurationMs).toBe(1000);
    expect(Date.parse(copied.displayStartedAt!)).toBe(Date.parse(T3) - 1000);
    expect(Date.parse(copied.displayFinishedAt!)).toBe(Date.parse(T3));
    expect(copied.displayAfterAnchor).toBeUndefined();
    expect(copied.priorContinuationMs).toBeUndefined();
    expect(copied.priorDurationMs).toBe(1000);
  });

  it("splits straddling prior intervals at the anchor", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    // Retry from c: b straddled the prior start of c (T3).
    const state = view([
      step("a", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
        path: ["a"],
      }),
      step("b", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-b",
        path: ["b"],
      }),
      step("c", {
        startedAt: T4,
        finishedAt: T5,
        durationMs: 1000,
        path: ["c"],
      }),
    ]);

    graftCopiedWaterfallTiming(state, prior);

    const straddler = state.steps[1]!;
    expect(Date.parse(straddler.displayStartedAt!)).toBe(Date.parse(T4) - 2000);
    expect(Date.parse(straddler.displayFinishedAt!)).toBe(Date.parse(T4));
    expect(straddler.displayDurationMs).toBe(2000);
    expect(straddler.priorContinuationMs).toBeUndefined();

    // Make b straddle: prior b was [T1,T3], anchor c started at T2 on prior.
    // Rebuild prior so c started mid-b.
    const straddlePrior = buildPriorStepTimingIndex([
      { type: "run_started", runId: "run-prior", runSeq: 1, at: T0 },
      {
        type: "step_started",
        runId: "run-prior",
        runSeq: 2,
        at: T0,
        stepId: "s-a",
        parentStepId: null,
        name: "a",
        path: ["a"],
      },
      {
        type: "step_finished",
        runId: "run-prior",
        runSeq: 3,
        at: T1,
        stepId: "s-a",
        durationMs: 1000,
      },
      {
        type: "step_started",
        runId: "run-prior",
        runSeq: 4,
        at: T1,
        stepId: "s-b",
        parentStepId: null,
        name: "b",
        path: ["b"],
      },
      {
        type: "step_started",
        runId: "run-prior",
        runSeq: 5,
        at: T2,
        stepId: "s-c",
        parentStepId: null,
        name: "c",
        path: ["c"],
      },
      {
        type: "step_finished",
        runId: "run-prior",
        runSeq: 6,
        at: T3,
        stepId: "s-b",
        durationMs: 2000,
      },
      {
        type: "step_finished",
        runId: "run-prior",
        runSeq: 7,
        at: T3,
        stepId: "s-c",
        durationMs: 1000,
      },
      { type: "run_finished", runId: "run-prior", runSeq: 8, at: T3 },
    ]);

    const straddleState = view([
      step("a", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
        path: ["a"],
      }),
      step("b", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-b",
        path: ["b"],
      }),
      step("c", {
        startedAt: T4,
        finishedAt: T5,
        durationMs: 1000,
        path: ["c"],
      }),
    ]);
    graftCopiedWaterfallTiming(straddleState, straddlePrior);

    const mid = straddleState.steps[1]!;
    expect(Date.parse(mid.displayStartedAt!)).toBe(Date.parse(T4) - 1000);
    expect(Date.parse(mid.displayFinishedAt!)).toBe(Date.parse(T4));
    expect(mid.displayDurationMs).toBe(1000);
    expect(mid.priorContinuationMs).toBe(1000);
    expect(mid.priorDurationMs).toBe(2000);
  });

  it("keeps copied spans that start at or after the re-exec anchor on this attempt's clock", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    // Retry from b (prior start T1). c ran entirely after that point.
    const state = view([
      step("a", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
        path: ["a"],
      }),
      step("b", {
        startedAt: T4,
        finishedAt: T5,
        durationMs: 1000,
        path: ["b"],
      }),
      step("c", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-c",
        path: ["c"],
        startedAt: T4,
        finishedAt: T4,
        durationMs: 0,
      }),
    ]);
    mergePriorRunTiming(prior, "nest-after", { startedAt: T3, finishedAt: T4 });
    const nested: InspectorRunSummary[] = [
      {
        runId: "nest-copy",
        workflowId: "child",
        status: "completed",
        startedAt: T4,
        finishedAt: T4,
        inputPreview: "",
        tags: [],
        replayOfRunId: "nest-after",
      },
    ];

    graftCopiedWaterfallTiming(state, prior, nested);

    const copied = state.steps[2]!;
    expect(copied.displayAfterAnchor).toBe(true);
    expect(copied.displayDurationMs).toBe(1000);
    expect(copied.priorContinuationMs).toBeUndefined();
    expect(Date.parse(copied.displayStartedAt!)).toBe(Date.parse(T4) + 2000);
    expect(Date.parse(copied.displayFinishedAt!)).toBe(Date.parse(T4) + 3000);

    const scale = computeWaterfallScale({
      runStartedAt: state.startedAt,
      runFinishedAt: state.finishedAt,
      runStatus: "completed",
      steps: state.steps,
      nowMs: Date.parse(T5) + 3000,
      ownerRunId: state.runId,
    });
    const bar = computeSpanWaterfallBar(copied, scale, Date.parse(T5) + 3000);
    expect(bar?.copied).toBe(true);
    expect(bar?.afterAnchor).toBe(true);
    expect(bar?.durationMs).toBe(1000);
    const anchorLeft = ((Date.parse(T4) - scale.originMs) / scale.spanMs) * 100;
    expect(bar!.leftPct).toBeGreaterThan(anchorLeft);

    expect(nested[0]!.displayAfterAnchor).toBe(true);
    expect(nested[0]!.displayDurationMs).toBe(1000);
    expect(Date.parse(nested[0]!.displayStartedAt!)).toBe(Date.parse(T4) + 2000);
  });

  it("leaves honest timing when prior step timing is missing", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    const state = view([
      step("ghost", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "missing",
        path: ["ghost"],
      }),
      step("c", {
        startedAt: T3,
        finishedAt: T4,
        path: ["c"],
      }),
    ]);

    graftCopiedWaterfallTiming(state, prior);

    expect(state.steps[0]!.displayStartedAt).toBeUndefined();
    expect(state.steps[0]!.displayDurationMs).toBeUndefined();
  });

  it("extends waterfall scale origin for grafted starts before run.startedAt", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    const state = view([
      step("a", {
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
        path: ["a"],
      }),
      step("b", {
        startedAt: T3,
        finishedAt: T5,
        durationMs: 2000,
        path: ["b"],
      }),
    ]);
    graftCopiedWaterfallTiming(state, prior);

    const scale = computeWaterfallScale({
      runStartedAt: state.startedAt,
      runFinishedAt: state.finishedAt,
      runStatus: "completed",
      steps: state.steps,
      nowMs: Date.parse(T5),
      ownerRunId: state.runId,
    });

    expect(scale.originMs).toBe(Date.parse(T3) - 1000);
    const bar = computeSpanWaterfallBar(state.steps[0]!, scale, Date.parse(T5));
    expect(bar?.copied).toBe(true);
    expect(bar?.leftPct).toBe(0);
    expect(bar?.durationMs).toBe(1000);
  });

  it("grafts nested copied runs from prior run summaries", () => {
    const prior = buildPriorStepTimingIndex(priorEvents());
    mergePriorRunTiming(prior, "nest-prior", {
      startedAt: T0,
      finishedAt: T2,
    });
    const state = view([
      step("c", {
        startedAt: T3,
        finishedAt: T4,
        path: ["c"],
      }),
    ]);
    const nested: InspectorRunSummary[] = [
      {
        runId: "nest-copy",
        workflowId: "child",
        status: "completed",
        startedAt: T3,
        finishedAt: T3,
        inputPreview: "",
        tags: [],
        replayOfRunId: "nest-prior",
      },
    ];

    graftCopiedWaterfallTiming(state, prior, nested);

    expect(nested[0]!.displayDurationMs).toBe(2000);
    expect(Date.parse(nested[0]!.displayStartedAt!)).toBe(Date.parse(T0));
    expect(Date.parse(nested[0]!.displayFinishedAt!)).toBe(Date.parse(T2));
    expect(nested[0]!.priorContinuationMs).toBeUndefined();
  });

  it("places the retry point at the first step this attempt actually ran", () => {
    const steps = [
      step("a", {
        startedAt: T4,
        copiedFromPriorAttempt: true,
        replayedFromStepId: "s-a",
      }),
      step("b", { startedAt: T4 }),
      step("c", { startedAt: T5, copiedFromPriorAttempt: true }),
    ];
    expect(retryAnchorMs(steps)).toBe(Date.parse(T4));
    expect(
      retryAnchorMs([step("only-copied", { copiedFromPriorAttempt: true, startedAt: T4 })]),
    ).toBe(null);
  });
});
