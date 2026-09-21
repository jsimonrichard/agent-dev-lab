import type { TokenUsage } from "@agent-dev-lab/core";

/** Compact integer formatting for sidebar token totals (e.g. `1.2k`). */
export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs < 1000) {
    return String(Math.round(value));
  }
  if (abs < 1_000_000) {
    const thousands = value / 1000;
    const rounded = abs < 10_000 ? thousands.toFixed(1) : String(Math.round(thousands));
    return `${rounded.replace(/\.0$/, "")}k`;
  }
  const millions = value / 1_000_000;
  const rounded = abs < 10_000_000 ? millions.toFixed(1) : String(Math.round(millions));
  return `${rounded.replace(/\.0$/, "")}M`;
}

/**
 * One-line sidebar label. Prefers `in` / `out` when available so the two
 * directions stay visible; falls back to total only when neither is present.
 */
export function formatTokenUsageLabel(usage: TokenUsage | undefined): string | undefined {
  if (!usage) {
    return undefined;
  }
  const parts: string[] = [];
  if (typeof usage.inputTokens === "number") {
    parts.push(`${formatTokenCount(usage.inputTokens)} in`);
  }
  if (typeof usage.outputTokens === "number") {
    parts.push(`${formatTokenCount(usage.outputTokens)} out`);
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  if (typeof usage.totalTokens === "number") {
    return `${formatTokenCount(usage.totalTokens)} tok`;
  }
  return undefined;
}

/** Compact multi-part label for inspect headers (`in` / `out` first, then extras). */
export function formatTokenUsageDetail(usage: TokenUsage | undefined): string | undefined {
  if (!usage) {
    return undefined;
  }
  const parts: string[] = [];
  if (typeof usage.inputTokens === "number") {
    parts.push(`${formatTokenCount(usage.inputTokens)} in`);
  }
  if (typeof usage.outputTokens === "number") {
    parts.push(`${formatTokenCount(usage.outputTokens)} out`);
  }
  if (typeof usage.totalTokens === "number") {
    parts.push(`${formatTokenCount(usage.totalTokens)} total`);
  }
  if (typeof usage.cachedInputTokens === "number") {
    parts.push(`${formatTokenCount(usage.cachedInputTokens)} cached`);
  }
  if (typeof usage.reasoningTokens === "number") {
    parts.push(`${formatTokenCount(usage.reasoningTokens)} reasoning`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Rows for the settings Usage section — Input and Output as separate lines. */
export function tokenUsageSettingRows(
  usage: TokenUsage | undefined,
): Array<{ label: string; value: string }> {
  if (!usage) {
    return [];
  }
  const rows: Array<{ label: string; value: string }> = [];
  if (typeof usage.inputTokens === "number") {
    rows.push({ label: "Input", value: formatTokenCount(usage.inputTokens) });
  }
  if (typeof usage.outputTokens === "number") {
    rows.push({ label: "Output", value: formatTokenCount(usage.outputTokens) });
  }
  if (typeof usage.totalTokens === "number") {
    rows.push({ label: "Total", value: formatTokenCount(usage.totalTokens) });
  }
  if (typeof usage.cachedInputTokens === "number") {
    rows.push({ label: "Cached input", value: formatTokenCount(usage.cachedInputTokens) });
  }
  if (typeof usage.reasoningTokens === "number") {
    rows.push({ label: "Reasoning", value: formatTokenCount(usage.reasoningTokens) });
  }
  return rows;
}
