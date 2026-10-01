import type { EffectDecision, EffectGate, EffectHandler, EffectIntent } from "./types";

/** Reason used when the handler chain returns no decision. */
export const EFFECT_GATE_UNDECIDED_REASON = "No effect handler allowed this intent (fail closed)";

/**
 * Compose handlers in order. The first defined {@link EffectDecision} wins.
 * If every handler returns `undefined` (or the list is empty), deny.
 */
export function composeEffectHandlers(handlers: readonly EffectHandler[]): EffectGate {
  return {
    async handle(intent: EffectIntent): Promise<EffectDecision> {
      for (const handler of handlers) {
        const decision = await handler.onIntent(intent);
        if (decision !== undefined) {
          return decision;
        }
      }
      return { action: "deny", reason: EFFECT_GATE_UNDECIDED_REASON };
    },
  };
}
