import { describe, expect, it } from "bun:test";

import { sumTokenUsage, toTokenUsage } from "./token-usage";

describe("toTokenUsage", () => {
  it("keeps finite token fields and drops the rest", () => {
    expect(
      toTokenUsage({
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
        cachedInputTokens: 3,
        reasoningTokens: 1,
        extra: 99,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
      cachedInputTokens: 3,
      reasoningTokens: 1,
    });
  });

  it("returns undefined when nothing usable is present", () => {
    expect(toTokenUsage(undefined)).toBeUndefined();
    expect(toTokenUsage({})).toBeUndefined();
    expect(toTokenUsage({ inputTokens: Number.NaN })).toBeUndefined();
  });
});

describe("sumTokenUsage", () => {
  it("sums only fields that appear on at least one input", () => {
    expect(
      sumTokenUsage([
        { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        { inputTokens: 5, cachedInputTokens: 3 },
        undefined,
        null,
      ]),
    ).toEqual({
      inputTokens: 15,
      outputTokens: 2,
      totalTokens: 12,
      cachedInputTokens: 3,
    });
  });

  it("returns undefined when every input is empty", () => {
    expect(sumTokenUsage([undefined, null, {}])).toBeUndefined();
  });
});
