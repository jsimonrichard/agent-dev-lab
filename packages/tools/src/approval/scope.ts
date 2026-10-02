import type { ExtendedToolProviderContext } from "@agent-dev-lab/core";

import type { ToolEffectScope } from "./types.ts";

/**
 * Build {@link ToolEffectScope} from a provider `getTools` context.
 * When the agent is not inside a workflow, uses `agent:${agentCallId}` as the
 * run id so the required {@link import("@agent-dev-lab/core").EffectIntent.workflowRunId}
 * field is always set without inventing a silent empty default.
 */
export function effectScopeFromToolProviderContext(
  ctx: Pick<ExtendedToolProviderContext, "agentCallId" | "workflow">,
): ToolEffectScope {
  return {
    workflowRunId: ctx.workflow?.workflowRunId ?? `agent:${ctx.agentCallId}`,
    agentCallId: ctx.agentCallId,
    stepId: ctx.workflow?.stepId ?? null,
  };
}
