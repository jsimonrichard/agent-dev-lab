import { AdlError, type ExtendedToolProviderContext } from "@agent-dev-lab/core";

import type { ToolEffectScope } from "./types.ts";

/**
 * Build {@link ToolEffectScope} from a provider `getTools` context.
 * When the agent is not inside a workflow, uses `agent:${agentCallId}` as the
 * run id so the required {@link import("@agent-dev-lab/core").EffectIntent.workflowRunId}
 * field is always set without inventing a silent empty default.
 *
 * Fail closed when {@link ExtendedToolProviderContext.recordEffect} is missing —
 * gated tools must not materialize without persisting intents.
 */
export function effectScopeFromToolProviderContext(
  ctx: Pick<ExtendedToolProviderContext, "agentCallId" | "workflow" | "recordEffect">,
): ToolEffectScope {
  if (!ctx.recordEffect) {
    throw new AdlError(
      "INVALID_CONTEXT",
      "ToolProvider context is missing recordEffect. Agent turns attach RunRecorder.emit; " +
        "tests must pass recordEffect (or testToolEffectScope()) when calling getTools.",
    );
  }
  return {
    workflowRunId: ctx.workflow?.workflowRunId ?? `agent:${ctx.agentCallId}`,
    agentCallId: ctx.agentCallId,
    stepId: ctx.workflow?.stepId ?? null,
    recordEffect: ctx.recordEffect,
  };
}
