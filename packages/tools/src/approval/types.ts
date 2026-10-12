import type { EffectEventRecorder, EffectGate, Reversibility } from "@agent-dev-lab/core";

/**
 * Run identity closed over at tool construction (from `getTools` context, or an
 * explicit test/playground value). Required on every gated factory — there is no
 * ambient default workflow id.
 */
export interface ToolEffectScope {
  workflowRunId: string;
  agentCallId?: string | null;
  stepId?: string | null;
  /**
   * Persist `effect_intent` / `effect_settled`. Usually `RunRecorder.emit` from the
   * active agent/workflow turn. Required — no silent skip of intent emission.
   */
  recordEffect: EffectEventRecorder["emit"];
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
  /**
   * Where the tool runs when it is not one of this package's built-ins, e.g. `"mcp:github"`.
   * Part of the tool's identity: a rewrite cannot change it, and remembered approvals are
   * keyed by it, so a same-named tool from another server is asked about separately.
   */
  source?: string;
}

export type ToolReversibility = Reversibility;

/** No-op `recordEffect` for unit tests that only exercise jail / executor behavior. */
export const silentRecordEffect: EffectEventRecorder["emit"] = async () => {};

/** Test/playground {@link ToolEffectScope} with a silent emit hook. */
export function testToolEffectScope(
  workflowRunId = "test",
  extras?: Omit<Partial<ToolEffectScope>, "workflowRunId" | "recordEffect"> & {
    recordEffect?: EffectEventRecorder["emit"];
  },
): ToolEffectScope {
  const { recordEffect, ...rest } = extras ?? {};
  return {
    workflowRunId,
    recordEffect: recordEffect ?? silentRecordEffect,
    ...rest,
  };
}
