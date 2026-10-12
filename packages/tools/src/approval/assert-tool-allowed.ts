import {
  AdlError,
  err,
  gateWithIntent,
  ok,
  type EffectGate,
  type EffectIntent,
  type Result,
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

type ToolCallArgs<TInput> = {
  gate: EffectGate;
  toolName: string;
  input: TInput;
  effectScope: ToolEffectScope;
  toolCallId?: string;
  reversibility?: Reversibility;
  /** {@link ToolEffectPayload.source}; omit for this package's built-in tools. */
  source?: string;
};

/**
 * Ask {@link EffectGate} before materializing a tool side effect.
 *
 * Mapping: tool call → `EffectIntent` with `kind: "tool"` and
 * `payload: { toolName, input, source? }` → `EffectDecision`:
 * - `allow` — `Ok` with the original input
 * - `rewrite` — `Ok` with `payload.input` from the rewritten tool payload; `toolName` and
 *   `source` are the tool's identity and cannot change
 * - `deny` — `Err` with the gate's reason (callers decide how a denial reaches the model)
 * - `suspend` — throw unless the host wrapped the gate with `parkingEffectGate`
 *
 * Emits `effect_intent` / `effect_settled` via {@link ToolEffectScope.recordEffect}.
 */
export async function decideToolCall<TInput>(
  args: ToolCallArgs<TInput>,
): Promise<Result<TInput, string>> {
  const payload: ToolEffectPayload = {
    toolName: args.toolName,
    input: args.input,
    ...(args.source !== undefined ? { source: args.source } : {}),
  };
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
      return ok(args.input);
    case "deny":
      return err(decision.reason);
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
      if (decision.payload.source !== args.source) {
        throw new AdlError(
          "INVALID_INPUT",
          `EffectGate rewrite changed the source of "${args.toolName}"; tool identity cannot ` +
            "be rewritten.",
        );
      }
      return ok(decision.payload.input as TInput);
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

/** {@link decideToolCall}, with a denial thrown as {@link AdlError} (`INVALID_INPUT`). */
export async function assertToolAllowed<TInput>(args: ToolCallArgs<TInput>): Promise<TInput> {
  const decision = await decideToolCall(args);
  if (decision.isErr) {
    throw new AdlError("INVALID_INPUT", `Tool call denied: ${decision.error}`);
  }
  return decision.value;
}
