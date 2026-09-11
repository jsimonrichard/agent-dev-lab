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

const describeWorkspaceEnvDescription =
  "Reports this workspace's working directory, file read/write byte caps, and the bash " +
  "sandbox's writable/denied paths and network access. Call before an operation you're " +
  "unsure is allowed, or after one fails unexpectedly.";

const describeWorkspaceEnvInputSchema = z.object({});
type DescribeWorkspaceEnvInput = z.infer<typeof describeWorkspaceEnvInputSchema>;

/** Reported by `createWorkspaceToolProvider`'s `describeWorkspaceEnv` tool — the merge of the
 * file and bash sides' own info, under one `cwd`. */
export type DescribeWorkspaceEnvTool = Tool<
  DescribeWorkspaceEnvInput,
  { fileAccess: FileAccessInfo; bashAccess: BashAccessInfo }
>;

/**
 * `createWorkspaceToolProvider`'s tools — file tools, `bash`, and one combined
 * `describeWorkspaceEnv`. Named for its actual scope (this workspace's own file/bash sandbox),
 * not a generic "describeEnvironment" — a project may have other tools (e.g. a web-search tool)
 * with their own network access this doesn't cover, so the name shouldn't imply completeness. A
 * plain object-literal type alias, not `interface ... extends FileTools, BashTools` — see
 * `BashProviderTools`'s doc comment (`packages/tools/src/bash/provider.ts`) for why: an
 * interface anywhere in the shape loses the implicit index signature `ToolProvider<Tools
 * extends ToolSet>` needs.
 */
export type WorkspaceTools = {
  readFile: FileTools["readFile"];
  writeFile: FileTools["writeFile"];
  editFile: FileTools["editFile"];
  grep: SearchTools["grep"];
  glob: SearchTools["glob"];
  bash: BashTools["bash"];
  describeWorkspaceEnv: DescribeWorkspaceEnvTool;
};

export interface WorkspaceToolProviderOptions {
  /** Isolation strategy for the `bash` tool. Required — there is no unsandboxed default. */
  executor: BashExecutor;
  /** Default working directory when a call's context doesn't specify one — used as both the
   * file jail root and the bash cwd. */
  cwd?: string;
  /** Default wall-clock timeout (ms) for `bash` when a call's context doesn't specify one. */
  timeoutMs?: number;
  /** Default read byte cap for file tools when a call's context doesn't specify one. */
  maxReadBytes?: number;
  /** Default write byte cap for file tools when a call's context doesn't specify one. */
  maxWriteBytes?: number;
  /** Optional AI-based safety check layered on top of the bash sandbox — see
   * `BashSafetyCheckWorkflow`'s doc comment. */
  safetyCheck?: BashSafetyCheckWorkflow;
}

export interface WorkspaceToolProviderContext {
  /** Overrides `options.cwd` for this call — drives both the file jail root and the bash cwd. */
  cwd?: string;
  /** Overrides `options.timeoutMs` for this call. */
  timeoutMs?: number;
  /** Overrides `options.maxReadBytes` for this call. */
  maxReadBytes?: number;
  /** Overrides `options.maxWriteBytes` for this call. */
  maxWriteBytes?: number;
}

/**
 * The Mastra-style combined file+bash surface — "everything needed to work on a codebase in
 * one folder," under one `cwd`. Built by composing `createFileToolProvider` and
 * `createBashToolProvider` (rather than reimplementing jail/bash construction) and translating
 * the one shared `cwd` into each one's own field name — deliberately *not*
 * `combineToolProviders`, which would namespace context per source and risk the file root and
 * bash cwd drifting apart. For a narrower need (bash-only, no project-directory concept), use
 * `createBashToolProvider` directly instead.
 *
 * `cwd` here is set by the workflow/host via `toolProviderContext`, never by the model
 * directly, so it's trusted to point anywhere — the file jail fully re-scopes to it, while
 * bash's actual write permissions stay whatever `options.executor` was constructed with
 * (fixed, independent of `cwd`).
 */
export function createWorkspaceToolProvider(
  options: WorkspaceToolProviderOptions,
): ToolProvider<WorkspaceTools, WorkspaceToolProviderContext | undefined> {
  const fileProvider = createFileToolProvider({
    root: options.cwd,
    maxReadBytes: options.maxReadBytes,
    maxWriteBytes: options.maxWriteBytes,
  });
  const bashProvider = createBashToolProvider({
    executor: options.executor,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    safetyCheck: options.safetyCheck,
  });

  return {
    contextSchema: z
      .object({
        cwd: z.string(),
        timeoutMs: z.number(),
        maxReadBytes: z.number(),
        maxWriteBytes: z.number(),
      })
      .partial(),
    listTools(): ToolProviderToolSummary[] {
      // Mirrors `getTools`' merge below: each sub-provider's own describe-env tool
      // (`describeFileEnv` / `describeBashEnv`) is dropped in favor of this provider's
      // combined `describeWorkspaceEnv`.
      const dropOwnDescribeEnv = (summaries: ToolProviderToolSummary[]) =>
        summaries.filter(
          (summary) => summary.name !== "describeFileEnv" && summary.name !== "describeBashEnv",
        );
      return [
        ...dropOwnDescribeEnv(fileProvider.listTools?.() ?? []),
        { name: "grep", description: GREP_DESCRIPTION },
        { name: "glob", description: GLOB_DESCRIPTION },
        ...dropOwnDescribeEnv(bashProvider.listTools?.() ?? []),
        { name: "describeWorkspaceEnv", description: describeWorkspaceEnvDescription },
      ];
    },
    async getTools(ctx) {
      const cwd = ctx.toolProviderContext?.cwd ?? options.cwd;
      if (!cwd) {
        throw new AdlError(
          "INVALID_INPUT",
          "createWorkspaceToolProvider: no cwd given — pass options.cwd as a default, or " +
            "toolProviderContext.cwd per call.",
        );
      }
      const timeoutMs = ctx.toolProviderContext?.timeoutMs ?? options.timeoutMs;
      const maxReadBytes =
        ctx.toolProviderContext?.maxReadBytes ?? options.maxReadBytes ?? DEFAULT_MAX_BYTES;
      const maxWriteBytes =
        ctx.toolProviderContext?.maxWriteBytes ?? options.maxWriteBytes ?? DEFAULT_MAX_BYTES;

      const [fileTools, bashTools] = await Promise.all([
        fileProvider.getTools({
          ...ctx,
          toolProviderContext: { root: cwd, maxReadBytes, maxWriteBytes },
        }),
        bashProvider.getTools({ ...ctx, toolProviderContext: { cwd, timeoutMs } }),
      ]);
      const searchTools = createSearchTools({
        executor: options.executor,
        root: cwd,
        timeoutMs,
      });

      const describeWorkspaceEnv: DescribeWorkspaceEnvTool = tool({
        description: describeWorkspaceEnvDescription,
        inputSchema: describeWorkspaceEnvInputSchema,
        execute: async () => ({
          fileAccess: describeFileAccess(path.resolve(cwd), maxReadBytes, maxWriteBytes),
          bashAccess: describeBashAccess(options.executor, cwd, timeoutMs ?? DEFAULT_TIMEOUT_MS),
        }),
      });

      // Picked explicitly (not `{ ...fileTools, ...bashTools, describeWorkspaceEnv }`) so
      // each sub-provider's own describe-env tool (`describeFileEnv`/`describeBashEnv`, now
      // distinctly named and no longer colliding with each other) doesn't leak through
      // alongside this one combined tool.
      return {
        readFile: fileTools.readFile,
        writeFile: fileTools.writeFile,
        editFile: fileTools.editFile,
        grep: searchTools.grep,
        glob: searchTools.glob,
        bash: bashTools.bash,
        describeWorkspaceEnv,
      };
    },
  };
}
