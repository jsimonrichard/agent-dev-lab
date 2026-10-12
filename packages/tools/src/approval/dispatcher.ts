import {
  AdlError,
  type EffectDecision,
  type EffectHandler,
  type EffectIntent,
} from "@agent-dev-lab/core";

import type { ToolEffectPayload } from "./types.ts";

/**
 * Headless / host approval surface — thin adapter over {@link EffectHandler} for
 * `kind: "tool"` (and later `kind: "approval"`). Not a parallel resume protocol:
 * interactive UIs should return suspend and call WorkflowStore.resolveSuspend later.
 */
export interface ApprovalRequest {
  toolName: string;
  input: unknown;
  /** {@link ToolEffectPayload.source} — which server the tool runs on, when not built in. */
  source?: string;
  agentId?: string;
  workflowRunId?: string;
  agentCallId?: string | null;
  stepId?: string | null;
  intentId: string;
}

/**
 * `remember: "agentCall"` allows later calls of the same tool (same `source` and
 * `toolName`) in the same agent call without asking again. Without it, the allow
 * covers this call only.
 */
export type ApprovalDecision =
  | { decision: "allow"; remember?: "agentCall" }
  | { decision: "deny"; reason: string };

export interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
}

function toolPayload(intent: EffectIntent): ToolEffectPayload | undefined {
  if (intent.kind !== "tool" && intent.kind !== "approval") {
    return undefined;
  }
  const payload = intent.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("toolName" in payload) ||
    typeof (payload as ToolEffectPayload).toolName !== "string"
  ) {
    return undefined;
  }
  return payload as ToolEffectPayload;
}

function rememberKey(agentCallId: string, payload: ToolEffectPayload): string {
  return JSON.stringify([agentCallId, payload.source ?? null, payload.toolName]);
}

/**
 * Adapt an {@link ApprovalDispatcher} into an {@link EffectHandler}.
 * Defers (returns `undefined`) for non-tool / non-approval intents so it can sit
 * in a {@link import("@agent-dev-lab/core").composeEffectHandlers} chain.
 */
export function approvalDispatcherAsHandler(dispatcher: ApprovalDispatcher): EffectHandler {
  const remembered = new Set<string>();
  return {
    async onIntent(intent: EffectIntent): Promise<EffectDecision | undefined> {
      const payload = toolPayload(intent);
      if (!payload) {
        return undefined;
      }
      if (intent.agentCallId && remembered.has(rememberKey(intent.agentCallId, payload))) {
        return { action: "allow" };
      }
      const result = await dispatcher.request({
        toolName: payload.toolName,
        input: payload.input,
        ...(payload.source !== undefined ? { source: payload.source } : {}),
        workflowRunId: intent.workflowRunId,
        agentCallId: intent.agentCallId,
        stepId: intent.stepId,
        intentId: intent.id,
      });
      if (result.decision === "deny") {
        return { action: "deny", reason: result.reason };
      }
      if (result.remember === "agentCall") {
        if (!intent.agentCallId) {
          throw new AdlError(
            "INVALID_CONTEXT",
            `ApprovalDispatcher asked to remember an allow for "${payload.toolName}" outside an ` +
              "agent call; there is no call to scope it to.",
          );
        }
        remembered.add(rememberKey(intent.agentCallId, payload));
      }
      return { action: "allow" };
    },
  };
}
