const UUID_SCOPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(.+)$/i;
const GENERATED_SCOPE = /^(fork|conv|inspector):/i;

/** Compact label: strip `{runId}:` or a leading UUID so the run id stays in tooltips. */
export function formatMemoryScopeLabel(memoryScope: string, runId?: string): string {
  if (runId) {
    const prefix = `${runId}:`;
    if (memoryScope.startsWith(prefix)) {
      return memoryScope.slice(prefix.length);
    }
  }
  const uuidMatch = memoryScope.match(UUID_SCOPED);
  if (uuidMatch?.[1]) {
    return uuidMatch[1];
  }
  if (GENERATED_SCOPE.test(memoryScope)) {
    return "this conversation";
  }
  return memoryScope;
}

export function generatedForkTitle(sourceMemoryScope: string, sourceRunId: string): string {
  return `Fork · ${formatMemoryScopeLabel(sourceMemoryScope, sourceRunId)}`;
}

export function displayConversationTitle(
  title: string,
  fork?: { sourceEpisodeId: string; sourceMemoryScope: string; sourceRunId: string } | null,
): string {
  if (fork && title === `Fork · ${fork.sourceEpisodeId}`) {
    return generatedForkTitle(fork.sourceMemoryScope, fork.sourceRunId);
  }
  return title;
}
