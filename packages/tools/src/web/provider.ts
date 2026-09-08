import {
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import { ALLOWED_URL_SCHEMES } from "./address-policy.ts";
import {
  createFetchUrlTool,
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  FETCH_URL_DESCRIPTION,
  type FetchUrlToolOptions,
  type WebTools,
} from "./tools.ts";

/** The `describeWebEnv` tool's payload — see `createWebToolProvider`. */
export interface WebAccessInfo {
  /** URL schemes this call's `fetchUrl` will fetch. */
  allowedSchemes: readonly string[];
  /**
   * `hostname:port` origins exempt from the address check for this call — the only way to reach
   * a non-public address. Empty when nothing is exempt.
   */
  allowedHosts: readonly string[];
  /** The wall-clock timeout (ms) this call's `fetchUrl` actually enforces. */
  timeoutMs: number;
  /** The response byte cap this call's `fetchUrl` actually enforces. */
  maxResponseBytes: number;
  /** Redirect hops this call's `fetchUrl` will follow before refusing. */
  maxRedirects: number;
}

export function describeWebAccess(
  allowedHosts: readonly string[],
  timeoutMs: number,
  maxResponseBytes: number,
  maxRedirects: number,
): WebAccessInfo {
  return {
    allowedSchemes: ALLOWED_URL_SCHEMES,
    allowedHosts,
    timeoutMs,
    maxResponseBytes,
    maxRedirects,
  };
}

const describeWebEnvDescription =
  "Reports what fetchUrl is allowed to retrieve: the permitted URL schemes, any hosts exempt " +
  "from the private-address block, the response byte cap, the timeout, and the redirect limit. " +
  "Call before a fetch you're unsure is allowed, or after one fails unexpectedly.";

const describeWebEnvInputSchema = z.object({});
type DescribeWebEnvInput = z.infer<typeof describeWebEnvInputSchema>;

/** Reported by `createWebToolProvider`'s `describeWebEnv` tool. */
export type DescribeWebEnvTool = Tool<DescribeWebEnvInput, { webAccess: WebAccessInfo }>;

export interface WebToolProviderOptions {
  /** Default exempt origins when a call's context doesn't specify them. */
  allowedHosts?: readonly string[];
  /** Hostname resolver override, fixed at construction time — see `FetchUrlToolOptions`. */
  resolver?: FetchUrlToolOptions["resolver"];
  /** Default timeout (ms) when a call's context doesn't specify one. */
  timeoutMs?: number;
  /** Default response byte cap when a call's context doesn't specify one. */
  maxResponseBytes?: number;
  /** Default redirect limit when a call's context doesn't specify one. */
  maxRedirects?: number;
}

export interface WebToolProviderContext {
  /**
   * Overrides `options.allowedHosts` for this call. Settable because
   * `toolProviderContext` is host/workflow-supplied and trusted — the model never reaches it
   * (see `notes/tool-sandboxing.md`'s "trust, not restriction" note).
   */
  allowedHosts?: readonly string[];
  /** Overrides `options.timeoutMs` for this call. */
  timeoutMs?: number;
  /** Overrides `options.maxResponseBytes` for this call. */
  maxResponseBytes?: number;
  /** Overrides `options.maxRedirects` for this call. */
  maxRedirects?: number;
}

/**
 * `createWebToolProvider`'s tools — `fetchUrl` plus `describeWebEnv`. Named for its actual scope
 * (this tool's own network policy), not a generic "describeEnvironment": an agent may hold other
 * tools with their own network access that this knows nothing about. A plain object-literal type
 * alias, not an interface — see `BashProviderTools`'s doc comment for why an interface anywhere
 * in the shape loses the implicit index signature `ToolProvider<Tools extends ToolSet>` needs.
 */
export type WebProviderTools = {
  fetchUrl: WebTools["fetchUrl"];
  describeWebEnv: DescribeWebEnvTool;
};

/**
 * `ToolProvider` wrapping `createFetchUrlTool` so the caps, the timeout and the exempt-host
 * allowlist can be set per `agent.run()` call via `toolProviderContext` instead of being fixed at
 * construction time. Deliberately **not** folded into `createWorkspaceToolProvider`: that one is
 * the "file tools and bash sharing one `cwd`" surface, and `fetchUrl` has no `cwd` and touches no
 * filesystem — it is a peer provider, and a project that wants both combines them with
 * `combineToolProviders`.
 */
export function createWebToolProvider(
  options: WebToolProviderOptions = {},
): ToolProvider<WebProviderTools, WebToolProviderContext | undefined> {
  return {
    contextSchema: z
      .object({
        allowedHosts: z.array(z.string()),
        timeoutMs: z.number(),
        maxResponseBytes: z.number(),
        maxRedirects: z.number(),
      })
      .partial(),
    listTools(): ToolProviderToolSummary[] {
      return [
        { name: "fetchUrl", description: FETCH_URL_DESCRIPTION },
        { name: "describeWebEnv", description: describeWebEnvDescription },
      ];
    },
    getTools(ctx) {
      const allowedHosts = ctx.toolProviderContext?.allowedHosts ?? options.allowedHosts ?? [];
      const timeoutMs =
        ctx.toolProviderContext?.timeoutMs ?? options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
      const maxResponseBytes =
        ctx.toolProviderContext?.maxResponseBytes ??
        options.maxResponseBytes ??
        DEFAULT_MAX_RESPONSE_BYTES;
      const maxRedirects =
        ctx.toolProviderContext?.maxRedirects ?? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

      const base = createFetchUrlTool({
        allowedHosts,
        resolver: options.resolver,
        timeoutMs,
        maxResponseBytes,
        maxRedirects,
      });

      const describeWebEnv: DescribeWebEnvTool = tool({
        description: describeWebEnvDescription,
        inputSchema: describeWebEnvInputSchema,
        execute: async () => ({
          webAccess: describeWebAccess(allowedHosts, timeoutMs, maxResponseBytes, maxRedirects),
        }),
      });

      return { ...base, describeWebEnv };
    },
  };
}
