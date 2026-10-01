import { sumTokenUsage, type AgentEpisodeSummary, type TokenUsage } from "@agent-dev-lab/core";

/** Minimal parent link for forest BFS (matches {@link WorkflowRunSummary} fields). */
export type RunParentLink = {
  workflowRunId: string;
  parentWorkflowRunId?: string | null;
};

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

/**
 * Sum finished episode usage for episodes whose `workflowRunId` is in `runIds`.
 * Absent when no matching episode reported usage.
 */
export function sumEpisodeUsageForRunIds(
  episodes: ReadonlyArray<AgentEpisodeSummary>,
  runIds: ReadonlySet<string>,
): TokenUsage | undefined {
  if (runIds.size === 0) {
    return undefined;
  }
  return sumTokenUsage(
    episodes.map((episode) =>
      episode.workflowRunId && runIds.has(episode.workflowRunId) ? episode.usage : undefined,
    ),
  );
}

/**
 * Index immediate children by `parentWorkflowRunId` for batch forest walks.
 * Runs with no parent are omitted from the map values (roots are BFS starts).
 */
export function buildChildrenByParent(runs: ReadonlyArray<RunParentLink>): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const run of runs) {
    const parentId = run.parentWorkflowRunId;
    if (parentId == null) {
      continue;
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(run.workflowRunId);
    } else {
      childrenByParent.set(parentId, [run.workflowRunId]);
    }
  }
  return childrenByParent;
}

/**
 * All nested run ids under `rootId` at any depth (BFS). Does not include `rootId`.
 */
export function descendantRunIds(
  rootId: string,
  childrenByParent: ReadonlyMap<string, ReadonlyArray<string>>,
): string[] {
  const descendants: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = childrenByParent.get(parentId);
    if (!children) {
      continue;
    }
    for (const childId of children) {
      if (seen.has(childId)) {
        continue;
      }
      seen.add(childId);
      descendants.push(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

/** Self + nested descendants — the run-id set for a workflow-run usage rollup. */
export function subtreeRunIds(
  rootId: string,
  childrenByParent: ReadonlyMap<string, ReadonlyArray<string>>,
): Set<string> {
  return new Set([rootId, ...descendantRunIds(rootId, childrenByParent)]);
}
