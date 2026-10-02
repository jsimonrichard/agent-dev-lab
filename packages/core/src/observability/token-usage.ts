/**
 * Provider-reported token counts for one agent episode (or a rollup of episodes).
 *
 * Persisted/UI shape keeps flat `cachedInputTokens` / `reasoningTokens` (SQLite columns).
 * {@link toTokenUsage} also maps AI SDK 7 nested `inputTokenDetails.cacheReadTokens` /
 * `outputTokenDetails.reasoningTokens` into those fields.
 *
 * Fields are omitted when the provider did not report them — never invent zeros.
 */
export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

const USAGE_KEYS = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
  "reasoningTokens",
] as const satisfies ReadonlyArray<keyof TokenUsage>;

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalize an AI SDK (or partial) usage object into {@link TokenUsage}.
 * Returns `undefined` when every field is missing/non-finite.
 *
 * Accepts both the flat ADL/v5 fields and AI SDK 7 nested detail fields.
 */
export function toTokenUsage(raw: unknown): TokenUsage | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const inputDetails =
    source.inputTokenDetails !== null && typeof source.inputTokenDetails === "object"
      ? (source.inputTokenDetails as Record<string, unknown>)
      : undefined;
  const outputDetails =
    source.outputTokenDetails !== null && typeof source.outputTokenDetails === "object"
      ? (source.outputTokenDetails as Record<string, unknown>)
      : undefined;

  const usage: TokenUsage = {};
  let any = false;
  for (const key of USAGE_KEYS) {
    const value = readFiniteNumber(source[key]);
    if (value !== undefined) {
      usage[key] = value;
      any = true;
    }
  }
  if (usage.cachedInputTokens === undefined) {
    const cacheRead = readFiniteNumber(inputDetails?.cacheReadTokens);
    if (cacheRead !== undefined) {
      usage.cachedInputTokens = cacheRead;
      any = true;
    }
  }
  if (usage.reasoningTokens === undefined) {
    const reasoning = readFiniteNumber(outputDetails?.reasoningTokens);
    if (reasoning !== undefined) {
      usage.reasoningTokens = reasoning;
      any = true;
    }
  }
  return any ? usage : undefined;
}

/**
 * Sum token usage across episodes. Each field is present only when at least one
 * input defined it; missing fields stay absent (not coerced to 0).
 */
export function sumTokenUsage(
  usages: ReadonlyArray<TokenUsage | undefined | null>,
): TokenUsage | undefined {
  const sums: Record<(typeof USAGE_KEYS)[number], number | undefined> = {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
    cachedInputTokens: undefined,
    reasoningTokens: undefined,
  };
  let any = false;
  for (const usage of usages) {
    if (!usage) {
      continue;
    }
    for (const key of USAGE_KEYS) {
      const value = usage[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        sums[key] = (sums[key] ?? 0) + value;
        any = true;
      }
    }
  }
  if (!any) {
    return undefined;
  }
  const result: TokenUsage = {};
  for (const key of USAGE_KEYS) {
    const value = sums[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
