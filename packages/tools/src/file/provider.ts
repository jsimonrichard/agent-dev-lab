import path from "node:path";

import {
  AdlError,
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import {
  createFileTools,
  DEFAULT_MAX_BYTES,
  EDIT_FILE_DESCRIPTION,
  READ_FILE_DESCRIPTION,
  WRITE_FILE_DESCRIPTION,
  type FileTools,
} from "./tools";

/** The `describeFileEnv` tool's payload — see `createFileToolProvider`. */
export interface FileAccessInfo {
  /** The sandbox root this call's file tools are actually jailed to. */
  root: string;
  maxReadBytes: number;
  maxWriteBytes: number;
}

export function describeFileAccess(
  root: string,
  maxReadBytes: number,
  maxWriteBytes: number,
): FileAccessInfo {
  return { root, maxReadBytes, maxWriteBytes };
}

const describeFileEnvDescription =
  "Reports the file sandbox's root directory and read/write byte caps. Call before a file " +
  "operation you're unsure is allowed, or after one fails unexpectedly.";

const describeFileEnvInputSchema = z.object({});
type DescribeFileEnvInput = z.infer<typeof describeFileEnvInputSchema>;

/** Reported by `createFileToolProvider`'s `describeFileEnv` tool. */
export type DescribeFileEnvTool = Tool<DescribeFileEnvInput, { fileAccess: FileAccessInfo }>;

export interface FileToolProviderOptions {
  /** Default sandbox root when a call's context doesn't specify one. */
  root?: string;
  /** Default read byte cap when a call's context doesn't specify one. */
  maxReadBytes?: number;
  /** Default write byte cap when a call's context doesn't specify one. */
  maxWriteBytes?: number;
}

export interface FileToolProviderContext {
  /** Overrides `options.root` for this call. */
  root?: string;
  /** Overrides `options.maxReadBytes` for this call. */
  maxReadBytes?: number;
  /** Overrides `options.maxWriteBytes` for this call. */
  maxWriteBytes?: number;
}

/**
 * `createFileToolProvider`'s tools — the file tools plus `describeFileEnv`. Named for its
 * actual scope (this file jail's own config), not a generic "describeEnvironment" — a project
 * may have other tools this doesn't cover, so the name shouldn't imply completeness. A plain
 * object-literal type alias, not `interface ... extends FileTools` — see `BashProviderTools`'s
 * doc comment (`packages/tools/src/bash/provider.ts`) for why: an interface anywhere in the
 * shape loses the implicit index signature `ToolProvider<Tools extends ToolSet>` needs.
 */
export type FileProviderTools = {
  readFile: FileTools["readFile"];
  writeFile: FileTools["writeFile"];
  editFile: FileTools["editFile"];
  describeFileEnv: DescribeFileEnvTool;
};

function cacheKey(root: string, maxReadBytes: number, maxWriteBytes: number): string {
  return `${root}::${maxReadBytes}::${maxWriteBytes}`;
}

/**
 * `ToolProvider` wrapping `createFileTools` so `root`/`maxReadBytes`/`maxWriteBytes` can be set
 * per `agent.run()` call via `toolProviderContext` (set by the workflow/host, not the model —
 * see `notes/tool-sandboxing.md`'s "trust, not restriction" note) instead of being fixed at
 * construction time. Caches the constructed `FileTools` (and its `FileJail`'s cached `realpath`
 * promise) per distinct resolved `(root, maxReadBytes, maxWriteBytes)` combination, since the
 * common case is the same combination recurring across many calls in one run.
 */
export function createFileToolProvider(
  options: FileToolProviderOptions,
): ToolProvider<FileProviderTools, FileToolProviderContext | undefined> {
  const cache = new Map<string, FileTools>();

  return {
    contextSchema: z
      .object({ root: z.string(), maxReadBytes: z.number(), maxWriteBytes: z.number() })
      .partial(),
    listTools(): ToolProviderToolSummary[] {
      return [
        { name: "readFile", description: READ_FILE_DESCRIPTION },
        { name: "writeFile", description: WRITE_FILE_DESCRIPTION },
        { name: "editFile", description: EDIT_FILE_DESCRIPTION },
        { name: "describeFileEnv", description: describeFileEnvDescription },
      ];
    },
    getTools(ctx) {
      const root = ctx.toolProviderContext?.root ?? options.root;
      if (!root) {
        throw new AdlError(
          "INVALID_INPUT",
          "createFileToolProvider: no root given — pass options.root as a default, or " +
            "toolProviderContext.root per call.",
        );
      }
      const maxReadBytes =
        ctx.toolProviderContext?.maxReadBytes ?? options.maxReadBytes ?? DEFAULT_MAX_BYTES;
      const maxWriteBytes =
        ctx.toolProviderContext?.maxWriteBytes ?? options.maxWriteBytes ?? DEFAULT_MAX_BYTES;

      const resolvedRoot = path.resolve(root);
      const key = cacheKey(resolvedRoot, maxReadBytes, maxWriteBytes);
      let fileTools = cache.get(key);
      if (!fileTools) {
        fileTools = createFileTools({ root: resolvedRoot, maxReadBytes, maxWriteBytes });
        cache.set(key, fileTools);
      }

      const describeFileEnv: DescribeFileEnvTool = tool({
        description: describeFileEnvDescription,
        inputSchema: describeFileEnvInputSchema,
        execute: async () => ({
          fileAccess: describeFileAccess(resolvedRoot, maxReadBytes, maxWriteBytes),
        }),
      });

      return { ...fileTools, describeFileEnv };
    },
  };
}
