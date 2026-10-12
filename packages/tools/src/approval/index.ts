/**
 * Tool-call approval as an {@link import("@agent-dev-lab/core").EffectGate} adapter.
 *
 * Public mapping: tool intent (`kind: "tool"`, payload `{ toolName, input }`) →
 * {@link import("@agent-dev-lab/core").EffectDecision}. Remembering an allow for the rest of
 * an agent call is dispatcher policy (`remember: "agentCall"`), not a core decision variant.
 * Inspection UI Allow/Deny is a follow-up host dispatcher — not shipped here.
 */
export {
  assertToolAllowed,
  decideToolCall,
  TOOL_SUSPEND_UNSUPPORTED_MESSAGE,
} from "./assert-tool-allowed.ts";
export {
  approvalDispatcherAsHandler,
  type ApprovalDecision,
  type ApprovalDispatcher,
  type ApprovalRequest,
} from "./dispatcher.ts";
export { effectScopeFromToolProviderContext } from "./scope.ts";
export { silentRecordEffect, testToolEffectScope } from "./types.ts";
export type {
  GatedToolOptions,
  ToolEffectPayload,
  ToolEffectScope,
  ToolReversibility,
} from "./types.ts";
