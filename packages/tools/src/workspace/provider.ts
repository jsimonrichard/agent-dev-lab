import path from "node:path";

import {
  AdlError,
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor } from "../bash/executor";
import {
  createBashToolProvider,
  describeBashAccess,
  type BashAccessInfo,
  type BashSafetyCheckWorkflow,
} from "../bash/provider";
import { DEFAULT_TIMEOUT_MS, type BashTools } from "../bash/tools";
import { createFileToolProvider, describeFileAccess, type FileAccessInfo } from "../file/provider";
import {
  createSearchTools,
  GLOB_DESCRIPTION,
  GREP_DESCRIPTION,
  type SearchTools,
} from "../file/search";
import { DEFAULT_MAX_BYTES, type FileTools } from "../file/tools";
import {
  createWebToolProvider,
  describeWebAccess,
  webToolProviderContextSchema,
  type WebAccessInfo,
  type WebToolProviderContext,
  type WebToolProviderOptions,
} from "../web/provider";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  type FetchUrlTool,
} from "../web/tools";

function describeWorkspaceEnvDescription(includeFetchUrl: boolean): string {
  return (
    "Reports this workspace's working directory, file read/write byte caps, and the bash " +
    "sandbox's writable/denied paths and network access" +
    (includeFetchUrl ? ", and what fetchUrl is allowed to retrieve" : "") +
    ". Call before an operation you're unsure is allowed, or after one fails unexpectedly."
  );
}

const describeWorkspaceEnvInputSchema = z.object({});
type DescribeWorkspaceEnvInput = z.infer<typeof describeWorkspaceEnvInputSchema>;

/** Reported by `createWorkspaceToolProvider`'s `describeWorkspaceEnv` tool — the merge of the
 * file, bash, and (when enabled) fetch sides' own info. File and bash share one `cwd`; fetch
 * has none. `webAccess` is omitted when `options.fetchUrl` is `false`. */
export type DescribeWorkspaceEnvTool = Tool<
  DescribeWorkspaceEnvInput,
  { fileAccess: FileAccessInfo; bashAccess: BashAccessInfo; webAccess?: WebAccessInfo }
>;

/**
 * `createWorkspaceToolProvider`'s tools — file tools, `bash`, optional `fetchUrl`, and one
 * combined `describeWorkspaceEnv`. `fetchUrl` is present unless constructed with
 * `fetchUrl: false`. Named for its actual scope (this workspace's own file/bash sandbox plus
 * `fetchUrl` when enabled), not a generic "describeEnvironment" — a project may have other
 * tools (e.g. a web-search tool) with their own network access this doesn't cover, so the
 * name shouldn't imply completeness. A plain object-literal type alias, not
 * `interface ... extends FileTools, BashTools` — see `BashProviderTools`'s doc comment
 * (`packages/tools/src/bash/provider.ts`) for why: an interface anywhere in the shape loses
 * the implicit index signature `ToolProvider<Tools extends ToolSet>` needs.
 */
export type WorkspaceTools = {
  readFile: FileTools["readFile"];
  writeFile: FileTools["writeFile"];
  editFile: FileTools["editFile"];
  grep: SearchTools["grep"];
  glob: SearchTools["glob"];
  bash: BashTools["bash"];
  fetchUrl?: FetchUrlTool;
  describeWorkspaceEnv: DescribeWorkspaceEnvTool;
};

export interface WorkspaceToolProviderContext {
  /** Overrides `options.cwd` for this call — drives both the file jail root and the bash cwd. */
  cwd?: string;
  /** Overrides `options.bashTimeoutMs` for this call — bash (and search) only, never `fetchUrl`. */
  bashTimeoutMs?: number;
  /** Overrides `options.maxReadBytes` for this call. */
  maxReadBytes?: number;
  /** Overrides `options.maxWriteBytes` for this call. */
  maxWriteBytes?: number;
  /** Overrides `options.allowedUrls` for this call — see `WebToolProviderContext.allowedUrls`. */
  allowedUrls?: WebToolProviderContext["allowedUrls"];
  /** Overrides `options.allowPrivateNetwork` for this call. */
  allowPrivateNetwork?: WebToolProviderContext["allowPrivateNetwork"];
  /** Overrides `options.fetchTimeoutMs` for this call — `fetchUrl` only, never bash.
   * Named apart from `bashTimeoutMs` so the two independent knobs cannot collide. */
  fetchTimeoutMs?: WebToolProviderContext["timeoutMs"];
  /** Overrides `options.maxResponseBytes` for this call. */
  maxResponseBytes?: WebToolProviderContext["maxResponseBytes"];
  /** Overrides `options.maxRedirects` for this call. */
  maxRedirects?: WebToolProviderContext["maxRedirects"];
}

export interface WorkspaceToolProviderOptions extends WorkspaceToolProviderContext {
  /** Isolation strategy for the `bash` tool. Required — there is no unsandboxed default. */
  executor: BashExecutor;
  /** Optional AI-based safety check layered on top of the bash sandbox — see
   * `BashSafetyCheckWorkflow`'s doc comment. */
  safetyCheck?: BashSafetyCheckWorkflow;
  /** Hostname resolver override, fixed at construction time — see `FetchUrlToolOptions`. */
  resolver?: WebToolProviderOptions["resolver"];
  /**
   * Include `fetchUrl`. Default `true`. Set `false` to omit the tool from `listTools` /
   * `getTools`. Empty `allowedUrls` is not a deny — public http(s) still works — so it does
   * not remove the tool. Fetch options (`allowedUrls`, `allowPrivateNetwork`,
   * `fetchTimeoutMs`, `maxResponseBytes`, `maxRedirects`, `resolver`) and the matching
   * `toolProviderContext` fields are rejected when this is `false`.
   */
  fetchUrl?: boolean;
}

const FETCH_OPTION_KEYS = [
  "allowedUrls",
  "allowPrivateNetwork",
  "fetchTimeoutMs",
  "maxResponseBytes",
  "maxRedirects",
  "resolver",
] as const satisfies readonly (keyof WorkspaceToolProviderOptions)[];

const FETCH_CONTEXT_KEYS = [
  "allowedUrls",
  "allowPrivateNetwork",
  "fetchTimeoutMs",
  "maxResponseBytes",
  "maxRedirects",
] as const satisfies readonly (keyof WorkspaceToolProviderContext)[];

function setKeys<K extends string>(values: Partial<Record<K, unknown>>, keys: readonly K[]): K[] {
  return keys.filter((key) => values[key] !== undefined);
}

function assertFetchConfigAllowed(
  includeFetchUrl: boolean,
  keys: readonly string[],
  where: "options" | "toolProviderContext",
): void {
  if (includeFetchUrl || keys.length === 0) {
    return;
  }
  throw new AdlError(
    "INVALID_INPUT",
    "createWorkspaceToolProvider: fetchUrl is disabled but " +
      `${keys.join(", ")} ${keys.length === 1 ? "was" : "were"} set on ${where}.`,
  );
}

/**
 * The Mastra-style combined file+bash+fetch surface — "everything needed to work on a
 * codebase in one folder," under one `cwd`, plus `fetchUrl` (which has no working directory)
 * unless constructed with `fetchUrl: false`. Built by composing `createFileToolProvider`,
 * `createBashToolProvider`, and `createWebToolProvider` (rather than reimplementing
 * jail/bash/fetch construction) and translating the one shared `cwd` into the file and bash
 * field names — deliberately *not* `combineToolProviders`, which would namespace context per
 * source and risk the file root and bash cwd drifting apart. Timeouts are `bashTimeoutMs` and
 * `fetchTimeoutMs` so the two independent knobs cannot collide. For a narrower need, use the
 * atomic provider directly.
 *
 * `cwd` here is set by the workflow/host via `toolProviderContext`, never by the model
 * directly, so it's trusted to point anywhere — the file jail fully re-scopes to it, while
 * bash's actual write permissions stay whatever `options.executor` was constructed with
 * (fixed, independent of `cwd`).
 */
export function createWorkspaceToolProvider(
  options: WorkspaceToolProviderOptions,
): ToolProvider<WorkspaceTools, WorkspaceToolProviderContext | undefined> {
  const includeFetchUrl = options.fetchUrl !== false;
  assertFetchConfigAllowed(includeFetchUrl, setKeys(options, FETCH_OPTION_KEYS), "options");

  const fileProvider = createFileToolProvider({
    root: options.cwd,
    maxReadBytes: options.maxReadBytes,
    maxWriteBytes: options.maxWriteBytes,
  });
  const bashProvider = createBashToolProvider({
    executor: options.executor,
    cwd: options.cwd,
    timeoutMs: options.bashTimeoutMs,
    safetyCheck: options.safetyCheck,
  });
  const webProvider = includeFetchUrl
    ? createWebToolProvider({
        allowedUrls: options.allowedUrls,
        allowPrivateNetwork: options.allowPrivateNetwork,
        timeoutMs: options.fetchTimeoutMs,
        maxResponseBytes: options.maxResponseBytes,
        maxRedirects: options.maxRedirects,
        resolver: options.resolver,
      })
    : undefined;

  const workspaceOwnContextSchema = z
    .object({
      cwd: z.string(),
      bashTimeoutMs: z.number(),
      maxReadBytes: z.number(),
      maxWriteBytes: z.number(),
    })
    .partial();

  return {
    contextSchema: includeFetchUrl
      ? workspaceOwnContextSchema
          .extend({ fetchTimeoutMs: z.number().optional() })
          .extend(webToolProviderContextSchema.omit({ timeoutMs: true }).shape)
      : workspaceOwnContextSchema,
    listTools(): ToolProviderToolSummary[] {
      // Mirrors `getTools`' merge below: each sub-provider's own describe-env tool
      // (`describeFileEnv` / `describeBashEnv` / `describeWebEnv`) is dropped in favor of
      // this provider's combined `describeWorkspaceEnv`.
      const dropOwnDescribeEnv = (summaries: ToolProviderToolSummary[]) =>
        summaries.filter(
          (summary) =>
            summary.name !== "describeFileEnv" &&
            summary.name !== "describeBashEnv" &&
            summary.name !== "describeWebEnv",
        );
      return [
        ...dropOwnDescribeEnv(fileProvider.listTools?.() ?? []),
        { name: "grep", description: GREP_DESCRIPTION },
        { name: "glob", description: GLOB_DESCRIPTION },
        ...dropOwnDescribeEnv(bashProvider.listTools?.() ?? []),
        ...(webProvider ? dropOwnDescribeEnv(webProvider.listTools?.() ?? []) : []),
        {
          name: "describeWorkspaceEnv",
          description: describeWorkspaceEnvDescription(includeFetchUrl),
        },
      ];
    },
    async getTools(ctx) {
      assertFetchConfigAllowed(
        includeFetchUrl,
        setKeys(ctx.toolProviderContext ?? {}, FETCH_CONTEXT_KEYS),
        "toolProviderContext",
      );
      const cwd = ctx.toolProviderContext?.cwd ?? options.cwd;
      if (!cwd) {
        throw new AdlError(
          "INVALID_INPUT",
          "createWorkspaceToolProvider: no cwd given — pass options.cwd as a default, or " +
            "toolProviderContext.cwd per call.",
        );
      }
      const bashTimeoutMs = ctx.toolProviderContext?.bashTimeoutMs ?? options.bashTimeoutMs;
      const maxReadBytes =
        ctx.toolProviderContext?.maxReadBytes ?? options.maxReadBytes ?? DEFAULT_MAX_BYTES;
      const maxWriteBytes =
        ctx.toolProviderContext?.maxWriteBytes ?? options.maxWriteBytes ?? DEFAULT_MAX_BYTES;
      const allowedUrls = ctx.toolProviderContext?.allowedUrls ?? options.allowedUrls ?? [];
      const allowPrivateNetwork =
        ctx.toolProviderContext?.allowPrivateNetwork ?? options.allowPrivateNetwork ?? false;
      const fetchTimeoutMs =
        ctx.toolProviderContext?.fetchTimeoutMs ??
        options.fetchTimeoutMs ??
        DEFAULT_FETCH_TIMEOUT_MS;
      const maxResponseBytes =
        ctx.toolProviderContext?.maxResponseBytes ??
        options.maxResponseBytes ??
        DEFAULT_MAX_RESPONSE_BYTES;
      const maxRedirects =
        ctx.toolProviderContext?.maxRedirects ?? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

      const [fileTools, bashTools, webTools] = await Promise.all([
        fileProvider.getTools({
          ...ctx,
          toolProviderContext: { root: cwd, maxReadBytes, maxWriteBytes },
        }),
        bashProvider.getTools({
          ...ctx,
          toolProviderContext: { cwd, timeoutMs: bashTimeoutMs },
        }),
        webProvider
          ? webProvider.getTools({
              ...ctx,
              toolProviderContext: {
                allowedUrls,
                allowPrivateNetwork,
                timeoutMs: fetchTimeoutMs,
                maxResponseBytes,
                maxRedirects,
              },
            })
          : Promise.resolve(undefined),
      ]);
      const searchTools = createSearchTools({
        executor: options.executor,
        root: cwd,
        timeoutMs: bashTimeoutMs,
      });

      const describeWorkspaceEnv: DescribeWorkspaceEnvTool = tool({
        description: describeWorkspaceEnvDescription(includeFetchUrl),
        inputSchema: describeWorkspaceEnvInputSchema,
        execute: async () => ({
          fileAccess: describeFileAccess(path.resolve(cwd), maxReadBytes, maxWriteBytes),
          bashAccess: describeBashAccess(
            options.executor,
            cwd,
            bashTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          ),
          ...(webTools
            ? {
                webAccess: describeWebAccess(
                  allowedUrls,
                  allowPrivateNetwork,
                  fetchTimeoutMs,
                  maxResponseBytes,
                  maxRedirects,
                ),
              }
            : {}),
        }),
      });

      // Picked explicitly (not `{ ...fileTools, ...bashTools, ...webTools, describeWorkspaceEnv }`)
      // so each sub-provider's own describe-env tool doesn't leak through alongside this one
      // combined tool.
      return {
        readFile: fileTools.readFile,
        writeFile: fileTools.writeFile,
        editFile: fileTools.editFile,
        grep: searchTools.grep,
        glob: searchTools.glob,
        bash: bashTools.bash,
        ...(webTools ? { fetchUrl: webTools.fetchUrl } : {}),
        describeWorkspaceEnv,
      };
    },
  };
}
