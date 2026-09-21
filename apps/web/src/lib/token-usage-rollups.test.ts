import { describe, expect, it } from "bun:test";

import type { AgentEpisodeSummary } from "@agent-dev-lab/core";

import { sumEpisodeUsageByKey } from "./token-usage-rollups";

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
