import { describe, expect, it } from "bun:test";

import {
  buildRunViewState,
  findEpisodeInTree,
  mergeSeededStepRecords,
  resolveRunSelection,
  collectRunWarnings,
  resolveRetryStepId,
} from "./run-projection";
import type { RunEvent } from "./types";
import type { AgentEpisode, StepNode } from "./types";

function episode(id: string): AgentEpisode {
  return {
    episodeId: id,
    agentId: "researcher",
    memoryScope: `${id}:notes`,
    status: "completed",
    streamingText: "",
    warnings: [],
  };
}

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

describe("findEpisodeInTree", () => {
  it("finds a nested episode", () => {
    const notes = episode("ep-notes");
    const tree = [
      step("research", {
        children: [step("child", { parentStepId: "research", agentEpisodes: [notes] })],
      }),
    ];
    expect(findEpisodeInTree(tree, "ep-notes")).toEqual({
      step: tree[0]?.children[0],
      episode: notes,
    });
  });
});

describe("collectRunWarnings", () => {
  it("dedupes warnings across nested episodes", () => {
    const shared = "system prompt conflict";
    const tree = [
      step("outer", {
        agentEpisodes: [{ ...episode("a"), warnings: [shared, "first"] }],
        children: [
          step("inner", {
            parentStepId: "outer",
            agentEpisodes: [{ ...episode("b"), warnings: [shared, "second"] }],
          }),
        ],
      }),
    ];
    expect(collectRunWarnings(tree)).toEqual([shared, "first", "second"]);
  });
});

describe("resolveRunSelection", () => {
  const notes = episode("ep-notes");
  const critique = episode("ep-critique");
  const tree = [
    step("research", {
      agentEpisodes: [notes, critique],
    }),
    step("empty"),
  ];

  it("prefers the requested episode", () => {
    expect(resolveRunSelection(tree, { stepId: "empty", episodeId: "ep-critique" })).toEqual({
      stepId: "research",
      episodeId: "ep-critique",
    });
  });

  it("falls back to the requested step", () => {
    expect(resolveRunSelection(tree, { stepId: "empty" })).toEqual({
      stepId: "empty",
      episodeId: null,
    });
  });

  it("defaults to the first step that has a conversation", () => {
    expect(resolveRunSelection(tree)).toEqual({
      stepId: "research",
      episodeId: null,
    });
  });
});

describe("resolveRetryStepId", () => {
  it("prefers the selected step, else the first failed step", () => {
    const tree = [step("a"), step("b", { status: "failed" }), step("c", { status: "failed" })];
    expect(resolveRetryStepId(tree, "c")).toBe("c");
    expect(resolveRetryStepId(tree, null)).toBe("b");
    expect(resolveRetryStepId(tree, "missing")).toBe("b");
  });

  it("falls back to the first completed step when nothing failed", () => {
    const tree = [step("a"), step("b")];
    expect(resolveRetryStepId(tree)).toBe("a");
  });
});

describe("mergeSeededStepRecords", () => {
  it("adds completed copied steps before events arrive", () => {
    const view = buildRunViewState("run-1", [
      {
        type: "run_started",
        runSeq: 1,
        runId: "run-1",
        at: new Date(100).toISOString(),
        workflowId: "wf",
        input: {},
      } satisfies RunEvent,
    ]);
    mergeSeededStepRecords(view, [
      {
        stepId: "new-step",
        parentStepId: null,
        name: "research",
        path: ["research"],
        output: { ok: true },
        replayOfStepId: "old-step",
      },
    ]);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.copiedFromPriorAttempt).toBe(true);
    expect(view.steps[0]?.replayedFromStepId).toBe("old-step");
    expect(view.steps[0]?.status).toBe("completed");
  });

  it("annotates lineage on steps that already exist by path", () => {
    const view = buildRunViewState("run-1", [
      {
        type: "run_started",
        runSeq: 1,
        runId: "run-1",
        at: new Date(100).toISOString(),
        workflowId: "wf",
        input: {},
      },
      {
        type: "step_skipped",
        runSeq: 2,
        runId: "run-1",
        at: new Date(110).toISOString(),
        stepId: "s1",
        parentStepId: null,
        name: "research",
        path: ["research"],
        output: { cached: true },
      },
    ] satisfies RunEvent[]);
    expect(view.steps[0]?.copiedFromPriorAttempt).toBeFalsy();
    mergeSeededStepRecords(view, [
      {
        stepId: "seeded-s1",
        parentStepId: null,
        name: "research",
        path: ["research"],
        replayOfStepId: "prior-s1",
      },
    ]);
    expect(view.steps).toHaveLength(1);
    expect(view.steps[0]?.copiedFromPriorAttempt).toBe(true);
    expect(view.steps[0]?.replayedFromStepId).toBe("prior-s1");
  });
});

describe("buildRunViewState step_skipped", () => {
  it("marks replay lineage on skipped steps", () => {
    const view = buildRunViewState("run-1", [
      {
        type: "run_started",
        runSeq: 1,
        runId: "run-1",
        at: new Date(100).toISOString(),
        workflowId: "wf",
        input: {},
      },
      {
        type: "step_skipped",
        runSeq: 2,
        runId: "run-1",
        at: new Date(110).toISOString(),
        stepId: "s1",
        parentStepId: null,
        name: "research",
        path: ["research"],
        output: { cached: true },
        replayedFromStepId: "prior-s1",
      },
    ] satisfies RunEvent[]);
    expect(view.steps[0]?.copiedFromPriorAttempt).toBe(true);
    expect(view.steps[0]?.replayedFromStepId).toBe("prior-s1");
  });
});
