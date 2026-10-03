import type { InspectorRunSummary } from "@/lib/view-model/types";
import type { NestedRunTreeData } from "@/lib/workflow/workflow-waterfall";

export const EMPTY_NESTS: InspectorRunSummary[] = [];

export function buildNestsByOwnerStep(
  pageRunId: string,
  pageChildRuns: readonly InspectorRunSummary[],
  nestedByRunId: ReadonlyMap<string, NestedRunTreeData>,
): Map<string, InspectorRunSummary[]> {
  const map = new Map<string, InspectorRunSummary[]>();
  const add = (ownerRunId: string, runs: readonly InspectorRunSummary[]) => {
    const byParent = new Map<string, InspectorRunSummary[]>();
    for (const run of runs) {
      const parent = run.parentStepId ?? "";
      const list = byParent.get(parent);
      if (list) {
        list.push(run);
      } else {
        byParent.set(parent, [run]);
      }
    }
    for (const [parent, list] of byParent) {
      map.set(`${ownerRunId}\0${parent}`, list);
    }
  };
  add(pageRunId, pageChildRuns);
  for (const [runId, data] of nestedByRunId) {
    if (data.childRuns && data.childRuns.length > 0) {
      add(runId, data.childRuns);
    }
  }
  return map;
}
