import type { WorkflowRunHandle } from "@agent-dev-lab/core";

/**
 * Prefer a direct in-process handle; otherwise walk `parentWorkflowRunId` until an
 * active ancestor is found (nested runs share the parent's abort link).
 */
export async function resolveWorkflowCancel(
  runId: string,
  active: ReadonlyMap<string, Pick<WorkflowRunHandle<unknown>, "cancel">>,
  getParentWorkflowRunId: (id: string) => Promise<string | null | undefined>,
): Promise<(() => void) | null> {
  const direct = active.get(runId);
  if (direct) {
    return () => {
      direct.cancel();
    };
  }

  const seen = new Set<string>([runId]);
  let parentId = (await getParentWorkflowRunId(runId)) ?? null;
  while (parentId) {
    if (seen.has(parentId)) {
      throw new Error(`workflow run parent cycle involving ${runId}`);
    }
    seen.add(parentId);
    const ancestor = active.get(parentId);
    if (ancestor) {
      return () => {
        ancestor.cancel();
      };
    }
    parentId = (await getParentWorkflowRunId(parentId)) ?? null;
  }
  return null;
}
