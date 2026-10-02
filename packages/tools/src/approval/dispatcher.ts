import type { EffectDecision, EffectHandler, EffectIntent } from "@agent-dev-lab/core";

import type { ToolEffectPayload } from "./types.ts";

/**
 * Headless / host approval surface — thin adapter over {@link EffectHandler} for
 * `kind: "tool"` (and later `kind: "approval"`). Not a parallel resume protocol:
 * interactive UIs should await the human inside {@link ApprovalDispatcher.request}
 * and return allow/deny. Returning suspend requires SuspendStore (not in this package).
 */
export interface ApprovalRequest {
  toolName: string;
  input: unknown;
  agentId?: string;
  workflowRunId?: string;
  agentCallId?: string | null;
  stepId?: string | null;
  intentId: string;
}

export type ApprovalDecision = { decision: "allow" } | { decision: "deny"; reason: string };

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

/**
 * Adapt an {@link ApprovalDispatcher} into an {@link EffectHandler}.
 * Defers (returns `undefined`) for non-tool / non-approval intents so it can sit
 * in a {@link import("@agent-dev-lab/core").composeEffectHandlers} chain.
 */
export function approvalDispatcherAsHandler(dispatcher: ApprovalDispatcher): EffectHandler {
  return {
    async onIntent(intent: EffectIntent): Promise<EffectDecision | undefined> {
      const payload = toolPayload(intent);
      if (!payload) {
        return undefined;
      }
      const result = await dispatcher.request({
        toolName: payload.toolName,
        input: payload.input,
        workflowRunId: intent.workflowRunId,
        agentCallId: intent.agentCallId,
        stepId: intent.stepId,
        intentId: intent.id,
      });
      if (result.decision === "allow") {
        return { action: "allow" };
      }
      return { action: "deny", reason: result.reason };
    },
  };
}
