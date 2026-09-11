/**
 * @packageDocumentation
 *
 * Sandboxed file, bash, search (`grep`/`glob`), and `fetchUrl` tools for
 * `@agent-dev-lab/core`. Dangerous tools take their jail or executor as a
 * required argument — there is no zero-config unsandboxed default.
 *
 * Private package: versioned for changelog, not published.
 */
export {
  createFileJail,
  createFileToolProvider,
  createFileTools,
  createSearchTools,
  DEFAULT_MAX_BYTES,
  describeFileAccess,
} from "./file";
export type {
  DescribeFileEnvTool,
  FileAccessInfo,
  FileJail,
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
} from "./bash";
export type {
  AsrtBashExecutorOptions,
  BashAccessInfo,
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
  WorkspaceTools,
  WorkspaceToolProviderContext,
  WorkspaceToolProviderOptions,
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
