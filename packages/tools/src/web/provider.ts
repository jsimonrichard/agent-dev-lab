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
  type FetchUrlTool,
  type FetchUrlToolOptions,
} from "./tools.ts";
import type { UrlPattern } from "./url-pattern.ts";

/** The `describeWebEnv` tool's payload — see `createWebToolProvider`. */
export interface WebAccessInfo {
  /** URL schemes this call's `fetchUrl` will fetch. */
  allowedSchemes: readonly string[];
  /**
   * The URL patterns exempt from the address check for this call. Empty when nothing is exempt.
   * Reported as display strings (`String(pattern)`) rather than raw `UrlPattern` values — a
   * `RegExp` serializes to `"{}"` under `JSON.stringify`, silently losing the pattern once an AI
   * SDK turn serializes the tool result.
   */
  allowedUrls: readonly string[];
  /** `true` when this call's `fetchUrl` has the address check disabled entirely — see
   * `AddressPolicy.allowPrivateNetwork`. Its own field, not folded into `allowedUrls`. */
  allowPrivateNetwork: boolean;
  /** The wall-clock timeout (ms) this call's `fetchUrl` actually enforces. */
  timeoutMs: number;
  /** The response byte cap this call's `fetchUrl` actually enforces. */
  maxResponseBytes: number;
  /** Redirect hops this call's `fetchUrl` will follow before refusing. */
  maxRedirects: number;
}

export function describeWebAccess(
  allowedUrls: readonly UrlPattern[],
  allowPrivateNetwork: boolean,
  timeoutMs: number,
  maxResponseBytes: number,
  maxRedirects: number,
): WebAccessInfo {
  return {
    allowedSchemes: ALLOWED_URL_SCHEMES,
    allowedUrls: allowedUrls.map((pattern) => String(pattern)),
    allowPrivateNetwork,
    timeoutMs,
    maxResponseBytes,
    maxRedirects,
  };
}

const describeWebEnvDescription =
  "Reports what fetchUrl is allowed to retrieve: the permitted URL schemes, any URL patterns " +
  "exempt from the private-address block, whether that block is disabled entirely, the " +
  "response byte cap, the timeout, and the redirect limit. Call before a fetch you're unsure " +
  "is allowed, or after one fails unexpectedly.";

const describeWebEnvInputSchema = z.object({});
type DescribeWebEnvInput = z.infer<typeof describeWebEnvInputSchema>;

/** Reported by `createWebToolProvider`'s `describeWebEnv` tool. */
export type DescribeWebEnvTool = Tool<DescribeWebEnvInput, { webAccess: WebAccessInfo }>;

/**
 * Validates a `toolProviderContext` passed to `createWebToolProvider` — ground truth for
 * `WebToolProviderContext`, which is `z.infer`'d from it below rather than hand-typed alongside
 * it, so the two shapes can't drift. `allowedUrls` accepts a glob string or a `RegExp` instance
 * per entry — matching `AddressPolicy.allowedUrls`/`UrlPattern` exactly, not just the string half
 * of it, since a caller building `toolProviderContext` programmatically should get the same
 * schema-level guarantee this provider actually enforces at runtime.
 */
const webToolProviderContextSchema = z
  .object({
    allowedUrls: z.array(z.union([z.string(), z.instanceof(RegExp)])).readonly(),
    allowPrivateNetwork: z.boolean(),
    timeoutMs: z.number(),
    maxResponseBytes: z.number(),
    maxRedirects: z.number(),
  })
  .partial();

/**
 * Overrides `options` for one call — every field is optional, defaulting to `options`'s own
 * value. `toolProviderContext` is host/workflow-set and trusted — the model never reaches it.
 * A `RegExp` entry in `allowedUrls`
 * survives here (unlike `WebAccessInfo.allowedUrls`) since this is a plain in-process value,
 * never serialized through JSON.
 */
export type WebToolProviderContext = z.infer<typeof webToolProviderContextSchema>;

/**
 * Defaults for `createWebToolProvider`'s `fetchUrl` — every `WebToolProviderContext` field, used
 * when a call's `toolProviderContext` doesn't override it, plus `resolver`, which has no per-call
 * override because it's fixed at construction time.
 */
export interface WebToolProviderOptions extends WebToolProviderContext {
  /** Hostname resolver override, fixed at construction time — see `FetchUrlToolOptions`. */
  resolver?: FetchUrlToolOptions["resolver"];
}

/**
 * `createWebToolProvider`'s tools — `fetchUrl` plus `describeWebEnv`. Named for its actual scope,
 * not a generic "describeEnvironment": other tools may have network access this knows nothing
 * about. A plain object-literal type alias, not an interface — see `BashProviderTools`'s doc
 * comment for why an interface here loses the implicit index signature `ToolProvider` needs.
 */
export type WebProviderTools = {
  fetchUrl: FetchUrlTool;
  describeWebEnv: DescribeWebEnvTool;
};

/**
 * `ToolProvider` wrapping `createFetchUrlTool` so its options can be set per `agent.run()` call
 * via `toolProviderContext`. Deliberately **not** folded into `createWorkspaceToolProvider` (the
 * file+bash-sharing-one-`cwd` surface) — `fetchUrl` has no `cwd`; combine both via
 * `combineToolProviders` when a project wants them together.
 */
export function createWebToolProvider(
  options: WebToolProviderOptions = {},
): ToolProvider<WebProviderTools, WebToolProviderContext | undefined> {
  return {
    contextSchema: webToolProviderContextSchema,
    listTools(): ToolProviderToolSummary[] {
      return [
        { name: "fetchUrl", description: FETCH_URL_DESCRIPTION },
        { name: "describeWebEnv", description: describeWebEnvDescription },
      ];
    },
    getTools(ctx) {
      const allowedUrls = ctx.toolProviderContext?.allowedUrls ?? options.allowedUrls ?? [];
      const allowPrivateNetwork =
        ctx.toolProviderContext?.allowPrivateNetwork ?? options.allowPrivateNetwork ?? false;
      const timeoutMs =
        ctx.toolProviderContext?.timeoutMs ?? options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
      const maxResponseBytes =
        ctx.toolProviderContext?.maxResponseBytes ??
        options.maxResponseBytes ??
        DEFAULT_MAX_RESPONSE_BYTES;
      const maxRedirects =
        ctx.toolProviderContext?.maxRedirects ?? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

      const fetchUrl = createFetchUrlTool({
        allowedUrls,
        allowPrivateNetwork,
        resolver: options.resolver,
        timeoutMs,
        maxResponseBytes,
        maxRedirects,
      });

      const describeWebEnv: DescribeWebEnvTool = tool({
        description: describeWebEnvDescription,
        inputSchema: describeWebEnvInputSchema,
        execute: async () => ({
          webAccess: describeWebAccess(
            allowedUrls,
            allowPrivateNetwork,
            timeoutMs,
            maxResponseBytes,
            maxRedirects,
          ),
        }),
      });

      return { fetchUrl, describeWebEnv };
    },
  };
}
