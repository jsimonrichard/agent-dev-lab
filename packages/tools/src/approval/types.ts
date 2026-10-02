import type { EffectGate, Reversibility } from "@agent-dev-lab/core";

/**
 * Run identity closed over at tool construction (from `getTools` context, or an
 * explicit test/playground value). Required on every gated factory — there is no
 * ambient default workflow id.
 */
export interface ToolEffectScope {
  workflowRunId: string;
  agentCallId?: string | null;
  stepId?: string | null;
}

/** Shared constructor fields for tools that materialize through an {@link EffectGate}. */
export interface GatedToolOptions {
  /**
   * Pre-materialize gate. Required — pass {@link import("@agent-dev-lab/core").allowAllGate}
   * explicitly for tests / permissive local hosts.
   */
  effectGate: EffectGate;
  /** Run identity stamped onto each tool intent. */
  effectScope: ToolEffectScope;
}

/**
 * Intent payload for `kind: "tool"` — maps onto {@link import("@agent-dev-lab/core").EffectIntent.payload}.
 * A rewrite decision replaces this whole object.
 */
export interface ToolEffectPayload {
  toolName: string;
  input: unknown;
}

export type ToolReversibility = Reversibility;
