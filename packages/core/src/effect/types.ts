/**
 * Effect-gate contract: intent before materialize, shared by approval, debugger,
 * and (later) meta-agent interception. See `notes/execution-control-plan.md`.
 */

export type EffectKind = "tool" | "model" | "step" | "approval" | "custom";

export type Reversibility = "irreversible" | "compensable" | "reversible";

export type SuspendReason = "approval" | "debugger" | "policy" | "meta_agent";

/**
 * Pre-materialize description of an action that may touch the world.
 * {@link EffectIntent.id} is the primary {@link TraceCursor} address.
 */
export interface EffectIntent {
  id: string;
  kind: EffectKind;
  reversibility: Reversibility;
  workflowRunId: string;
  stepId?: string | null;
  agentCallId?: string | null;
  /** Discriminated by kind: toolName+input, model descriptor, step path, … */
  payload: unknown;
}

export interface EffectOutcome {
  intentId: string;
  status: "ok" | "denied" | "error" | "rewritten";
  result?: unknown;
  error?: { message: string; code?: string };
}

export interface SuspendHandle {
  id: string;
  intentId: string;
  workflowRunId: string;
  reason: SuspendReason;
  createdAt: string;
}

export type EffectDecision =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "rewrite"; payload: unknown }
  | { action: "suspend"; handle: SuspendHandle };

/**
 * Optional policy step in a handler chain. Return `undefined` to defer to the
 * next handler. When every handler defers, {@link composeEffectHandlers} denies.
 */
export interface EffectHandler {
  onIntent(intent: EffectIntent): Promise<EffectDecision | undefined>;
}

/** Required where materialization is possible — never optional with silent allow. */
export interface EffectGate {
  handle(intent: EffectIntent): Promise<EffectDecision>;
}

/**
 * Address of a point in a prior attempt's effect stream.
 * Primary key is {@link TraceCursor.effectId} (effect intent id).
 */
export interface TraceCursor {
  workflowRunId: string;
  /** Effect intent id — preferred re-entry key. */
  effectId?: string;
  /** UI alias when the cursor sits on a step-boundary intent. */
  stepId?: string;
  /** Optional: runSeq of the commit to replay through (inclusive). */
  runSeq?: number;
}
