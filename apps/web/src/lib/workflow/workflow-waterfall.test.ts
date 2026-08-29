import { describe, expect, it } from "bun:test";

import type { AgentEpisode, StepNode } from "../view-model/types";
import {
  computeStepWaterfallBar,
  computeWaterfallScale,
  flattenWorkflowRows,
  formatDuration,
  stepTimeRange,
  waterfallTickCount,
  waterfallTickMarks,
} from "./workflow-waterfall";

function episode(id: string, extra: Partial<AgentEpisode> = {}): AgentEpisode {
  return {
    episodeId: id,
    agentId: "researcher",
    memoryScope: `${id}:notes`,
    status: "completed",
    streamingText: "",
    ...extra,
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

const origin = "2026-01-01T00:00:00.000Z";
const originMs = Date.parse(origin);

describe("flattenWorkflowRows", () => {
  it("walks nested steps and conversations in tree order", () => {
    const notes = episode("ep-notes");
    const tree = [
      step("search", { agentEpisodes: [notes] }),
      step("analyze", {
        children: [
          step("briefing", { parentStepId: "analyze" }),
          step("critique", { parentStepId: "analyze" }),
        ],
      }),
    ];
    expect(
      flattenWorkflowRows(tree, { depth: 1 }).map((row) =>
        row.kind === "step"
          ? `${row.depth}:step:${row.step.stepId}`
          : `${row.depth}:ep:${row.episode.episodeId}`,
      ),
    ).toEqual([
      "1:step:search",
      "2:ep:ep-notes",
      "1:step:analyze",
      "2:step:briefing",
      "2:step:critique",
    ]);
  });

  it("hides nested steps and conversations when a parent is collapsed", () => {
    const notes = episode("ep-notes");
    const tree = [
      step("analyze", {
        agentEpisodes: [notes],
        children: [step("briefing", { parentStepId: "analyze" })],
      }),
      step("synthesize"),
    ];
    expect(
      flattenWorkflowRows(tree, { collapsedStepIds: new Set(["analyze"]) }).map((row) =>
        row.kind === "step" ? row.step.stepId : row.episode.episodeId,
      ),
    ).toEqual(["analyze", "synthesize"]);
  });
});

describe("computeWaterfallScale + bars", () => {
  it("places sequential steps by start offset, not just duration width", () => {
    const first = step("search", {
      startedAt: origin,
      finishedAt: "2026-01-01T00:00:02.000Z",
      durationMs: 2000,
    });
    const second = step("analyze", {
      startedAt: "2026-01-01T00:00:02.000Z",
      finishedAt: "2026-01-01T00:00:06.000Z",
      durationMs: 4000,
    });
    const scale = computeWaterfallScale({
      runStartedAt: origin,
      runFinishedAt: "2026-01-01T00:00:06.000Z",
      runStatus: "completed",
      steps: [first, second],
      nowMs: originMs + 6000,
    });

    expect(scale.spanMs).toBe(6000);
    const firstBar = computeStepWaterfallBar(first, scale, originMs + 6000);
    const secondBar = computeStepWaterfallBar(second, scale, originMs + 6000);
    expect(firstBar?.leftPct).toBeCloseTo(0);
    expect(firstBar?.widthPct).toBeCloseTo((2000 / 6000) * 100);
    expect(secondBar?.leftPct).toBeCloseTo((2000 / 6000) * 100);
    expect(secondBar?.widthPct).toBeCloseTo((4000 / 6000) * 100);
  });

  it("grows a running step to now while completed siblings stay put", () => {
    const done = step("search", {
      startedAt: origin,
      finishedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
    });
    const running = step("analyze", {
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
    });
    const nowMs = originMs + 4000;
    const scale = computeWaterfallScale({
      runStartedAt: origin,
      runStatus: "running",
      steps: [done, running],
      nowMs,
    });

    expect(scale.spanMs).toBe(4000);
    expect(stepTimeRange(running, nowMs)?.endMs).toBe(nowMs);
    const runningBar = computeStepWaterfallBar(running, scale, nowMs);
    expect(runningBar?.leftPct).toBeCloseTo(25);
    expect(runningBar?.widthPct).toBeCloseTo(75);
  });
});

describe("formatDuration", () => {
  it("formats milliseconds and seconds", () => {
    expect(formatDuration(120)).toBe("120ms");
    expect(formatDuration(1500)).toBe("1.5s");
  });
});

describe("waterfallTickCount", () => {
  it("keeps five marks at 1x and denser marks when zoomed", () => {
    expect(waterfallTickCount(1)).toBe(5);
    expect(waterfallTickCount(16)).toBe(17);
    expect(waterfallTickMarks({ originMs: 0, spanMs: 1000 }, 5)).toHaveLength(5);
  });
});
