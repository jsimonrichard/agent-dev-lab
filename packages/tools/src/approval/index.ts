/**
 * Tool-call approval as an {@link import("@agent-dev-lab/core").EffectGate} adapter.
 *
 * Public mapping: tool intent (`kind: "tool"`, payload `{ toolName, input }`) →
 * {@link import("@agent-dev-lab/core").EffectDecision}. Sticky allow-by-tool-name is
 * handler policy ({@link createStickyToolAllowHandler}), not a core decision variant.
 * Inspection UI Allow/Deny is a follow-up host dispatcher — not shipped here.
 */
export { assertToolAllowed, TOOL_SUSPEND_UNSUPPORTED_MESSAGE } from "./assert-tool-allowed.ts";
export {
  approvalDispatcherAsHandler,
  type ApprovalDecision,
  type ApprovalDispatcher,
  type ApprovalRequest,
} from "./dispatcher.ts";
export { effectScopeFromToolProviderContext } from "./scope.ts";
export { createStickyToolAllowHandler } from "./sticky.ts";
export type {
  GatedToolOptions,
  ToolEffectPayload,
  ToolEffectScope,
  ToolReversibility,
} from "./types.ts";
