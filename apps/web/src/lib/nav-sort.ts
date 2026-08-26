/** Latest ISO timestamp per id, taking the max when an id appears more than once. */
export function latestTimestampById<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  timestampOf: (item: T) => string,
): Map<string, string> {
  const lastUsed = new Map<string, string>();
  for (const item of items) {
    const id = idOf(item);
    const at = timestampOf(item);
    const existing = lastUsed.get(id);
    if (!existing || at > existing) {
      lastUsed.set(id, at);
    }
  }
  return lastUsed;
}

/**
 * Recently used ids first (newest timestamp wins). Unused ids follow,
 * with alphabetical order as the tie-breaker in both groups.
 */
export function sortByLastUsedThenAlpha(
  ids: readonly string[],
  lastUsedById: ReadonlyMap<string, string>,
): string[] {
  return [...ids].sort((a, b) => {
    const aUsed = lastUsedById.get(a);
    const bUsed = lastUsedById.get(b);
    if (aUsed && bUsed) {
      const byTime = bUsed.localeCompare(aUsed);
      if (byTime !== 0) {
        return byTime;
      }
    } else if (aUsed) {
      return -1;
    } else if (bUsed) {
      return 1;
    }
    return a.localeCompare(b);
  });
}
