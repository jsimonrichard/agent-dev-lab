import { sumTokenUsage, type AgentEpisodeSummary, type TokenUsage } from "@agent-dev-lab/core";

/** Sum episode usage keyed by a string derived from each episode (skips undefined keys). */
export function sumEpisodeUsageByKey(
  episodes: ReadonlyArray<AgentEpisodeSummary>,
  keyOf: (episode: AgentEpisodeSummary) => string | undefined,
): Map<string, TokenUsage> {
  const grouped = new Map<string, TokenUsage[]>();
  for (const episode of episodes) {
    const key = keyOf(episode);
    if (!key || !episode.usage) {
      continue;
    }
    const list = grouped.get(key);
    if (list) {
      list.push(episode.usage);
    } else {
      grouped.set(key, [episode.usage]);
    }
  }
  const result = new Map<string, TokenUsage>();
  for (const [key, usages] of grouped) {
    const summed = sumTokenUsage(usages);
    if (summed) {
      result.set(key, summed);
    }
  }
  return result;
}
