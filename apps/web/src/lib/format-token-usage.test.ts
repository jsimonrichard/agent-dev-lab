import { describe, expect, it } from "bun:test";

import {
  formatTokenCount,
  formatTokenUsageDetail,
  formatTokenUsageLabel,
  tokenUsageSettingRows,
} from "./format-token-usage";

describe("formatTokenCount", () => {
  it("formats small and large counts", () => {
    expect(formatTokenCount(42)).toBe("42");
    expect(formatTokenCount(1200)).toBe("1.2k");
    expect(formatTokenCount(15_000)).toBe("15k");
    expect(formatTokenCount(2_500_000)).toBe("2.5M");
  });
});

describe("formatTokenUsageLabel", () => {
  it("prefers in/out over a bare total", () => {
    expect(formatTokenUsageLabel({ totalTokens: 1200, inputTokens: 1000, outputTokens: 200 })).toBe(
      "1k in · 200 out",
    );
  });

  it("falls back to total when in/out are absent", () => {
    expect(formatTokenUsageLabel({ totalTokens: 1200 })).toBe("1.2k tok");
  });

  it("returns undefined when usage is empty", () => {
    expect(formatTokenUsageLabel(undefined)).toBeUndefined();
    expect(formatTokenUsageLabel({})).toBeUndefined();
  });
});

describe("formatTokenUsageDetail", () => {
  it("lists in/out before total and extras", () => {
    expect(
      formatTokenUsageDetail({
        totalTokens: 1200,
        inputTokens: 1000,
        outputTokens: 200,
        cachedInputTokens: 50,
      }),
    ).toBe("1k in · 200 out · 1.2k total · 50 cached");
  });
});

describe("tokenUsageSettingRows", () => {
  it("emits separate Input and Output rows", () => {
    expect(
      tokenUsageSettingRows({
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
      }),
    ).toEqual([
      { label: "Input", value: "1k" },
      { label: "Output", value: "200" },
      { label: "Total", value: "1.2k" },
    ]);
  });
});
