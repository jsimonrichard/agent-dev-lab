import path from "node:path";

import {
  AdlError,
  tool,
  type ExtendedToolProviderContext,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor, BashExecutorDescription } from "../bash/executor";
import type { BashSandboxBackend, BashSandboxPolicy } from "../bash/executor-pool";
import {
  createBashToolProvider,
  describeBashAccess,
  resolveBashExecutorForCall,
  UNBOUNDED_ALLOW_READ,
  type BashAccessInfo,
  type BashSafetyCheckWorkflow,
  type BashToolProviderContext,
} from "../bash/provider";
import { DEFAULT_TIMEOUT_MS, type BashTools } from "../bash/tools";
import { createFileToolProvider, describeFileAccess, type FileAccessInfo } from "../file/provider";
import {
  createSearchTools,
  GLOB_DESCRIPTION,
  GREP_DESCRIPTION,
  type SearchTools,
} from "../file/search";
import { DEFAULT_MAX_BYTES, type FileAllowRead, type FileTools } from "../file/tools";
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
import { releaseBashExecutor } from "../bash/executor-pool.ts";

function describeWorkspaceEnvDescription(includeFetchUrl: boolean): string {
  return (
    "Report this workspace's working directory, file read/write permissions, and bash permissions" +
    (includeFetchUrl ? ", plus what fetchUrl is allowed to retrieve" : "") +
    "."
  );
}

/**
 * File-tool path policy implied by the bash executor actually in effect. Bash reports
 * {@link UNBOUNDED_ALLOW_READ} for host-wide reads; file factories use the same sentinel
 * and omit → `[cwd]`. Lists are passed through as-is — `cwd` is not inserted.
 */
function filePolicyFromExecutor(described: BashExecutorDescription): {
  allowRead: FileAllowRead | undefined;
  denyRead: string[];
  allowWrite: string[];
  denyWrite: string[];
} {
  return {
    allowRead: described.allowRead,
    denyRead: described.denyRead ?? [],
    allowWrite: described.allowWrite,
    denyWrite: described.denyWrite ?? [],
  };
}

const describeWorkspaceEnvInputSchema = z.object({});
type DescribeWorkspaceEnvInput = z.infer<typeof describeWorkspaceEnvInputSchema>;

/**
 * {@link BashAccessInfo} as `describeWorkspaceEnv` reports it. The timeout is
 * {@link WorkspaceToolProviderContext.bashTimeoutMs}, not the atomic bash provider's
 * `timeoutMs`.
 */
export type WorkspaceBashAccessInfo = Omit<BashAccessInfo, "timeoutMs"> & {
  bashTimeoutMs: number;
};

/**
 * {@link WebAccessInfo} as `describeWorkspaceEnv` reports it. The timeout is
 * {@link WorkspaceToolProviderContext.fetchTimeoutMs}, not the atomic web provider's
 * `timeoutMs`.
 */
export type WorkspaceWebAccessInfo = Omit<WebAccessInfo, "timeoutMs"> & {
  fetchTimeoutMs: number;
};

function workspaceBashAccess(info: BashAccessInfo): WorkspaceBashAccessInfo {
  const { timeoutMs, ...rest } = info;
  return { ...rest, bashTimeoutMs: timeoutMs };
}

function workspaceWebAccess(info: WebAccessInfo): WorkspaceWebAccessInfo {
  const { timeoutMs, ...rest } = info;
  return { ...rest, fetchTimeoutMs: timeoutMs };
}

/** Reported by `createWorkspaceToolProvider`'s `describeWorkspaceEnv` tool — the merge of the
 * file, bash, and (when enabled) fetch sides' own info. File and bash share one `cwd`; fetch
 * has none. `webAccess` is omitted when `options.fetchUrl` is `false`. Timeouts use the
 * workspace knob names (`bashTimeoutMs` / `fetchTimeoutMs`), not the atomic `timeoutMs`. */
export type DescribeWorkspaceEnvTool = Tool<
  DescribeWorkspaceEnvInput,
  {
    fileAccess: FileAccessInfo;
    bashAccess: WorkspaceBashAccessInfo;
    webAccess?: WorkspaceWebAccessInfo;
  }
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

export interface WorkspaceToolProviderContext
  extends Partial<BashSandboxPolicy>, Omit<WebToolProviderContext, "timeoutMs"> {
  /** Overrides `options.cwd` for this call — drives both the file jail root and the bash cwd. */
  cwd?: string;
  /** Overrides `options.bashTimeoutMs` for this call — bash (and search) only, never `fetchUrl`. */
  bashTimeoutMs?: number;
  /** Overrides `options.maxReadBytes` for this call. */
  maxReadBytes?: number;
  /** Overrides `options.maxWriteBytes` for this call. */
  maxWriteBytes?: number;
  /** Overrides `options.fetchTimeoutMs` for this call — `fetchUrl` only, never bash.
   * Named apart from `bashTimeoutMs` so the two independent knobs cannot collide. */
  fetchTimeoutMs?: WebToolProviderContext["timeoutMs"];
}

export interface WorkspaceToolProviderOptions extends WorkspaceToolProviderContext {
  /**
   * Isolation strategy for the `bash` / search tools. Optional when policy (`allowWrite`, …)
   * is provided — acquires from the process pool. Escape hatch; mutually exclusive with
   * policy fields and `backend`.
   */
  executor?: BashExecutor;
  /** Sandbox backend when using the pool. Default `"asrt"`. Invalid with `executor`. */
  backend?: BashSandboxBackend;
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

function bashPolicyFromWorkspace(
  options: WorkspaceToolProviderOptions,
  context: WorkspaceToolProviderContext | undefined,
): {
  defaults: Partial<BashSandboxPolicy> & { allowWrite?: string[] };
  context: BashToolProviderContext | undefined;
} {
  return {
    defaults: {
      allowWrite: options.allowWrite,
      allowRead: options.allowRead,
      denyRead: options.denyRead,
      denyWrite: options.denyWrite,
      allowedDomains: options.allowedDomains,
      deniedDomains: options.deniedDomains,
      allowNetwork: options.allowNetwork,
      allowEnv: options.allowEnv,
    },
    context: context
      ? {
          cwd: context.cwd,
          timeoutMs: context.bashTimeoutMs,
          allowWrite: context.allowWrite,
          allowRead: context.allowRead,
          denyRead: context.denyRead,
          denyWrite: context.denyWrite,
          allowedDomains: context.allowedDomains,
          deniedDomains: context.deniedDomains,
          allowNetwork: context.allowNetwork,
          allowEnv: context.allowEnv,
        }
      : undefined,
  };
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
 * Pass either a pre-built `executor` or sandbox policy (`allowWrite`, …). `cwd` is set by the
 * workflow/host via `toolProviderContext`, never by the model directly — the file jail
 * re-scopes to it; bash write permissions come from the resolved executor's policy.
 */
export function createWorkspaceToolProvider(
  options: WorkspaceToolProviderOptions,
): ToolProvider<WorkspaceTools, WorkspaceToolProviderContext | undefined> {
  const includeFetchUrl = options.fetchUrl !== false;
  assertFetchConfigAllowed(includeFetchUrl, setKeys(options, FETCH_OPTION_KEYS), "options");

  // Fail closed at construction when options alone are already contradictory.
  if (options.executor) {
    resolveBashExecutorForCall({
      executor: options.executor,
      backend: options.backend,
      defaults: options,
      context: undefined,
      cwd: options.cwd,
      projectRoot: undefined,
    });
  }

  const fileProvider = createFileToolProvider({
    root: options.cwd,
    maxReadBytes: options.maxReadBytes,
    maxWriteBytes: options.maxWriteBytes,
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

  const heldKeys = new Set<string>();

  const workspaceOwnContextSchema = z
    .object({
      cwd: z.string(),
      bashTimeoutMs: z.number(),
      maxReadBytes: z.number(),
      maxWriteBytes: z.number(),
      allowWrite: z.array(z.string()),
      allowRead: z.union([z.array(z.string()), z.null(), z.literal(UNBOUNDED_ALLOW_READ)]),
      denyRead: z.array(z.string()),
      denyWrite: z.array(z.string()),
      allowedDomains: z.array(z.string()),
      deniedDomains: z.array(z.string()),
      allowNetwork: z.boolean(),
      allowEnv: z.union([z.literal(true), z.array(z.union([z.string(), z.instanceof(RegExp)]))]),
    })
    .partial();

  return {
    contextSchema: includeFetchUrl
      ? workspaceOwnContextSchema
          .extend({ fetchTimeoutMs: z.number().optional() })
          .extend(webToolProviderContextSchema.omit({ timeoutMs: true }).shape)
      : workspaceOwnContextSchema,
    listTools(): ToolProviderToolSummary[] {
      const bashList = createBashToolProvider({
        executor: options.executor,
        allowWrite: options.allowWrite,
        backend: options.backend,
        cwd: options.cwd,
        timeoutMs: options.bashTimeoutMs,
        safetyCheck: options.safetyCheck,
      }).listTools?.();
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
        ...dropOwnDescribeEnv(bashList ?? []),
        ...(webProvider ? dropOwnDescribeEnv(webProvider.listTools?.() ?? []) : []),
        {
          name: "describeWorkspaceEnv",
          description: describeWorkspaceEnvDescription(includeFetchUrl),
        },
      ];
    },
    async getTools(ctx: ExtendedToolProviderContext<WorkspaceToolProviderContext | undefined>) {
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

      const { defaults, context: bashContext } = bashPolicyFromWorkspace(
        options,
        ctx.toolProviderContext,
      );
      const { executor, poolKey } = resolveBashExecutorForCall({
        executor: options.executor,
        backend: options.backend,
        defaults,
        context: bashContext,
        cwd: options.cwd,
        projectRoot: ctx.projectRoot,
        heldKeys,
      });
      if (poolKey) {
        heldKeys.add(poolKey);
      }

      const bashProvider = createBashToolProvider({
        executor,
        cwd: options.cwd,
        timeoutMs: options.bashTimeoutMs,
        safetyCheck: options.safetyCheck,
      });

      const described = executor.describe();
      const {
        allowRead: fileAllowRead,
        denyRead: fileDenyRead,
        allowWrite: fileAllowWrite,
        denyWrite: fileDenyWrite,
      } = filePolicyFromExecutor(described);

      const [fileTools, bashTools, webTools] = await Promise.all([
        fileProvider.getTools({
          ...ctx,
          toolProviderContext: {
            root: cwd,
            allowRead: fileAllowRead,
            allowWrite: fileAllowWrite,
            denyRead: fileDenyRead,
            denyWrite: fileDenyWrite,
            maxReadBytes,
            maxWriteBytes,
          },
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
        executor,
        root: cwd,
        allowRead: fileAllowRead,
        denyRead: fileDenyRead,
        timeoutMs: bashTimeoutMs,
      });

      const describeWorkspaceEnv: DescribeWorkspaceEnvTool = tool({
        description: describeWorkspaceEnvDescription(includeFetchUrl),
        inputSchema: describeWorkspaceEnvInputSchema,
        execute: async () => ({
          fileAccess: describeFileAccess(
            path.resolve(cwd),
            maxReadBytes,
            maxWriteBytes,
            fileAllowRead,
            fileDenyRead,
            fileAllowWrite,
            fileDenyWrite,
          ),
          bashAccess: workspaceBashAccess(
            describeBashAccess(executor, cwd, bashTimeoutMs ?? DEFAULT_TIMEOUT_MS),
          ),
          ...(webTools
            ? {
                webAccess: workspaceWebAccess(
                  describeWebAccess(
                    allowedUrls,
                    allowPrivateNetwork,
                    fetchTimeoutMs,
                    maxResponseBytes,
                    maxRedirects,
                  ),
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
    async dispose() {
      const keys = [...heldKeys];
      heldKeys.clear();
      await Promise.all(keys.map((key) => releaseBashExecutor(key)));
    },
  };
}
