/**
 * @packageDocumentation
 *
 * Sandboxed file, bash, search (`grep`/`glob`), `fetchUrl`, and MCP client tools for
 * `@agent-dev-lab/core`. Providers take sandbox policy (pooled) or an escape-hatch
 * executor — there is no zero-config unsandboxed default. Side-effecting tools
 * (including MCP) require an {@link import("@agent-dev-lab/core").EffectGate}
 * (pass `allowAllGate` explicitly for tests / permissive hosts); MCP also
 * requires an explicit transport.
 */
export {
  assertToolAllowed,
  approvalDispatcherAsHandler,
  createStickyToolAllowHandler,
  effectScopeFromToolProviderContext,
  TOOL_SUSPEND_UNSUPPORTED_MESSAGE,
} from "./approval";
export type {
  ApprovalDecision,
  ApprovalDispatcher,
  ApprovalRequest,
  GatedToolOptions,
  ToolEffectPayload,
  ToolEffectScope,
  ToolReversibility,
} from "./approval";
export {
  createFileJail,
  createFileToolProvider,
  createFileTools,
  createSearchTools,
  DEFAULT_MAX_BYTES,
  describeFileAccess,
  resolveFileAllowRead,
} from "./file";
export type {
  DescribeFileEnvTool,
  FileAccessInfo,
  FileAllowRead,
  FileJail,
  FileJailOptions,
  FileProviderTools,
  FileTools,
  FileToolProviderContext,
  FileToolProviderOptions,
  FileToolsOptions,
  SearchTools,
  SearchToolsOptions,
  SearchToolResult,
} from "./file";
export {
  bashSafetyCheckInputSchema,
  bashSafetyVerdictSchema,
  createAsrtBashExecutor,
  createBashTool,
  createBashToolProvider,
  createNativeBashExecutor,
  DEFAULT_TIMEOUT_MS,
  describeBashAccess,
  acquireBashExecutor,
  releaseBashExecutor,
  canonicalizeBashSandboxPolicy,
  UNBOUNDED_ALLOW_READ,
} from "./bash";
export type {
  AsrtBashExecutorOptions,
  BashAccessInfo,
  ModelAllowRead,
  BashExecutor,
  BashExecutorDescription,
  BashExecutorProgress,
  BashExecutorResult,
  BashExecutorRunOptions,
  BashExecutorUpdate,
  BashProviderTools,
  BashSafetyCheckInput,
  BashSafetyCheckVerdict,
  BashSafetyCheckWorkflow,
  BashSandboxBackend,
  BashSandboxPolicy,
  BashTools,
  BashToolOptions,
  BashToolProviderContext,
  BashToolProviderOptions,
  BashToolResult,
  DescribeBashEnvTool,
  NativeBashExecutorOptions,
} from "./bash";
export { createWorkspaceToolProvider } from "./workspace";
export type {
  DescribeWorkspaceEnvTool,
  WorkspaceBashAccessInfo,
  WorkspaceTools,
  WorkspaceToolProviderContext,
  WorkspaceToolProviderOptions,
  WorkspaceWebAccessInfo,
} from "./workspace";
export { DEFAULT_SANDBOX_RELATIVE_PATH, resolveDefaultSandboxRoot } from "./paths";
export {
  assertAllowedUrl,
  createFetchUrlTool,
  createWebToolProvider,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  describeWebAccess,
  isPublicAddress,
  matchesUrlPattern,
  urlMatchCandidate,
} from "./web";
export type {
  AddressPolicy,
  DescribeWebEnvTool,
  FetchUrlResult,
  FetchUrlTool,
  FetchUrlToolOptions,
  HostnameResolver,
  UrlPattern,
  WebAccessInfo,
  WebProviderTools,
  WebToolProviderContext,
  WebToolProviderOptions,
} from "./web";
export { createMcpToolProvider } from "./mcp";
export type {
  McpToolEffectPayload,
  McpToolProviderOptions,
  McpToolSchemas,
  McpTransport,
  MCPTransport,
} from "./mcp";
