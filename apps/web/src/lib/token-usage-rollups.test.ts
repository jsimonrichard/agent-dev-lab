import { describe, expect, it } from "bun:test";

import type { AgentEpisodeSummary } from "@agent-dev-lab/core";

import {
  buildChildrenByParent,
  descendantRunIds,
  subtreeRunIds,
  sumEpisodeUsageByKey,
  sumEpisodeUsageForRunIds,
} from "./token-usage-rollups";

function episode(
  partial: Pick<AgentEpisodeSummary, "agentCallId" | "memoryScope"> & Partial<AgentEpisodeSummary>,
): AgentEpisodeSummary {
  return {
    agentId: "researcher",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "ok",
    ...partial,
  };
}

describe("sumEpisodeUsageByKey", () => {
  it("sums finished episode usage by memoryScope", () => {
    const byScope = sumEpisodeUsageByKey(
      [
        episode({
          agentCallId: "a",
          memoryScope: "conv:1",
          usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        }),
        episode({
          agentCallId: "b",
          memoryScope: "conv:1",
          usage: { inputTokens: 5, totalTokens: 8, cachedInputTokens: 1 },
        }),
        episode({
          agentCallId: "c",
          memoryScope: "conv:2",
          usage: { totalTokens: 3 },
        }),
        episode({ agentCallId: "d", memoryScope: "conv:3", status: "running" }),
      ],
      (item) => item.memoryScope,
    );

    expect(byScope.get("conv:1")).toEqual({
      inputTokens: 15,
      outputTokens: 2,
      totalTokens: 20,
      cachedInputTokens: 1,
    });
    expect(byScope.get("conv:2")).toEqual({ totalTokens: 3 });
    expect(byScope.has("conv:3")).toBe(false);
  });
});

describe("sumEpisodeUsageForRunIds", () => {
  const episodes = [
    episode({
      agentCallId: "parent-ep",
      memoryScope: "wf:parent",
      workflowRunId: "parent",
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    }),
    episode({
      agentCallId: "child-ep",
      memoryScope: "wf:child",
      workflowRunId: "child",
      usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
    }),
    episode({
      agentCallId: "other-ep",
      memoryScope: "wf:other",
      workflowRunId: "other",
      usage: { totalTokens: 99 },
    }),
    episode({
      agentCallId: "no-usage",
      memoryScope: "wf:parent",
      workflowRunId: "parent",
      status: "running",
    }),
  ];

  it("sums parent + child episode usage for a forest run-id set", () => {
    expect(sumEpisodeUsageForRunIds(episodes, new Set(["parent", "child"]))).toEqual({
      inputTokens: 15,
      outputTokens: 3,
      totalTokens: 18,
    });
  });

  it("returns undefined for an empty run-id set", () => {
    expect(sumEpisodeUsageForRunIds(episodes, new Set())).toBeUndefined();
  });

  it("ignores episodes outside the run-id set", () => {
    expect(sumEpisodeUsageForRunIds(episodes, new Set(["parent"]))).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
    expect(sumEpisodeUsageForRunIds(episodes, new Set(["missing"]))).toBeUndefined();
  });
});

describe("buildChildrenByParent / descendantRunIds / subtreeRunIds", () => {
  const runs = [
    { workflowRunId: "root", parentWorkflowRunId: null },
    { workflowRunId: "child", parentWorkflowRunId: "root" },
    { workflowRunId: "grandchild", parentWorkflowRunId: "child" },
    { workflowRunId: "isolated", parentWorkflowRunId: null },
    { workflowRunId: "sibling", parentWorkflowRunId: "root" },
  ];

  it("indexes children by parent and walks descendants", () => {
    const childrenByParent = buildChildrenByParent(runs);
    expect(childrenByParent.get("root")).toEqual(["child", "sibling"]);
    expect(childrenByParent.get("child")).toEqual(["grandchild"]);
    expect(childrenByParent.has("isolated")).toBe(false);

    expect(descendantRunIds("root", childrenByParent)).toEqual(["child", "sibling", "grandchild"]);
    expect(descendantRunIds("child", childrenByParent)).toEqual(["grandchild"]);
    expect(descendantRunIds("isolated", childrenByParent)).toEqual([]);

    expect([...subtreeRunIds("root", childrenByParent)].sort()).toEqual([
      "child",
      "grandchild",
      "root",
      "sibling",
    ]);
  });
});
