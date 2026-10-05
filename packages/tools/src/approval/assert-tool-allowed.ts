import {
  AdlError,
  gateWithIntent,
  type EffectGate,
  type EffectIntent,
  type Reversibility,
} from "@agent-dev-lab/core";
import { randomUUID } from "node:crypto";

import type { ToolEffectPayload, ToolEffectScope } from "./types.ts";

export const TOOL_SUSPEND_UNSUPPORTED_MESSAGE =
  "EffectGate returned suspend for a tool call without parkingEffectGate. " +
  "Wrap the gate with parkingEffectGate (core) so suspend persists, or await allow/deny in the handler.";

function isToolEffectPayload(value: unknown): value is ToolEffectPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "toolName" in value &&
    typeof (value as ToolEffectPayload).toolName === "string" &&
    "input" in value
  );
}

/**
 * Ask {@link EffectGate} before materializing a tool side effect.
 *
 * Mapping: tool call → `EffectIntent` with `kind: "tool"` and
 * `payload: { toolName, input }` → `EffectDecision`:
 * - `allow` — return the original input
 * - `rewrite` — return `payload.input` from the rewritten tool payload
 * - `deny` — throw {@link AdlError} (`INVALID_INPUT`)
 * - `suspend` — throw unless the host wrapped the gate with `parkingEffectGate`
 *
 * Emits `effect_intent` / `effect_settled` via {@link ToolEffectScope.recordEffect}.
 */
export async function assertToolAllowed<TInput>(args: {
  gate: EffectGate;
  toolName: string;
  input: TInput;
  effectScope: ToolEffectScope;
  toolCallId?: string;
  reversibility?: Reversibility;
}): Promise<TInput> {
  const payload: ToolEffectPayload = { toolName: args.toolName, input: args.input };
  const intent: EffectIntent = {
    id: args.toolCallId ?? randomUUID(),
    kind: "tool",
    reversibility: args.reversibility ?? "compensable",
    workflowRunId: args.effectScope.workflowRunId,
    stepId: args.effectScope.stepId,
    agentCallId: args.effectScope.agentCallId,
    payload,
  };

  let decision;
  try {
    decision = await gateWithIntent({
      recorder: { emit: args.effectScope.recordEffect },
      intent,
      gate: args.gate,
    });
  } catch (error) {
    if (error instanceof AdlError && error.message.includes("parkingEffectGate")) {
      throw new AdlError("INVALID_CONTEXT", TOOL_SUSPEND_UNSUPPORTED_MESSAGE, { cause: error });
    }
    throw error;
  }

  switch (decision.action) {
    case "allow":
      return args.input;
    case "deny":
      throw new AdlError("INVALID_INPUT", `Tool call denied: ${decision.reason}`);
    case "rewrite": {
      if (!isToolEffectPayload(decision.payload)) {
        throw new AdlError(
          "INVALID_INPUT",
          `EffectGate rewrite for "${args.toolName}" must replace the tool payload ` +
            `({ toolName, input }); got ${typeof decision.payload}.`,
        );
      }
      if (decision.payload.toolName !== args.toolName) {
        throw new AdlError(
          "INVALID_INPUT",
          `EffectGate rewrite changed toolName from "${args.toolName}" to ` +
            `"${decision.payload.toolName}"; tool identity cannot be rewritten.`,
        );
      }
      return decision.payload.input as TInput;
    }
    default: {
      const _exhaustive: never = decision;
      throw new AdlError(
        "INVALID_CONTEXT",
        `EffectGate returned an unknown decision: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
