import { AdlError } from "../errors";
import type { RunRecorder } from "../runtime/run-recorder";
import type { EffectGate, EffectIntent, SettledEffectDecision } from "./types";

export type EffectEventRecorder = Pick<RunRecorder, "emit">;

/**
 * Emit {@link import("../observability/events").EffectIntentEvent}, run the gate
 * (which may park via {@link parkingEffectGate}), then emit
 * {@link import("../observability/events").EffectSettledEvent}.
 *
 * Bare gates that return `suspend` fail closed — wrap with `parkingEffectGate`.
 */
export async function gateWithIntent(args: {
  recorder: EffectEventRecorder;
  intent: EffectIntent;
  gate: EffectGate;
}): Promise<SettledEffectDecision> {
  await args.recorder.emit({
    type: "effect_intent",
    workflowRunId: args.intent.workflowRunId,
    intent: args.intent,
  });

  const decision = await args.gate.handle(args.intent);
  if (decision.action === "suspend") {
    throw new AdlError(
      "INVALID_CONTEXT",
      "EffectGate returned suspend; wrap with parkingEffectGate so suspend persists",
    );
  }

  await args.recorder.emit({
    type: "effect_settled",
    workflowRunId: args.intent.workflowRunId,
    intentId: args.intent.id,
    decision,
  });
  return decision;
}
