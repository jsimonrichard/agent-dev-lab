import path from "node:path";

import {
  AdlError,
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import { UNBOUNDED_ALLOW_READ, type ModelAllowRead } from "../unbounded-allow-read.ts";

import {
  createFileTools,
  DEFAULT_MAX_BYTES,
  EDIT_FILE_DESCRIPTION,
  READ_FILE_DESCRIPTION,
  WRITE_FILE_DESCRIPTION,
  resolveFileAllowRead,
  type FileAllowRead,
  type FileTools,
} from "./tools.ts";

/** The `describeFileEnv` tool's payload — see `createFileToolProvider`. */
export interface FileAccessInfo {
  /** The sandbox root writes are jailed to, and the default relative-path base. */
  root: string;
  /**
   * Paths `readFile` may read, or {@link UNBOUNDED_ALLOW_READ} when reads are not confined.
   * Always the resolved default — omitted `allowRead` reports `[root]`; `null` reports `[]`.
   */
  allowRead: ModelAllowRead;
  /** Paths hidden from `readFile`. Empty when the caller set none. */
  denyRead: string[];
  maxReadBytes: number;
  maxWriteBytes: number;
}

/**
 * Report the read bound actually in effect after factory resolution.
 * Pass the factory-level value (including omitted / {@link UNBOUNDED_ALLOW_READ}); this
 * applies the same `[root]` default `createFileTools` does.
 */
export function describeFileAccess(
  root: string,
  maxReadBytes: number,
  maxWriteBytes: number,
  allowRead?: FileAllowRead,
  denyRead?: readonly string[] | null,
): FileAccessInfo {
  const resolved = resolveFileAllowRead(root, allowRead);
  return {
    root,
    allowRead: resolved,
    denyRead: denyRead == null ? [] : [...denyRead],
    maxReadBytes,
    maxWriteBytes,
  };
}

const describeFileEnvDescription =
  "Report the file sandbox root, read allow-list, and read/write byte caps.";

const describeFileEnvInputSchema = z.object({});
type DescribeFileEnvInput = z.infer<typeof describeFileEnvInputSchema>;

/** Reported by `createFileToolProvider`'s `describeFileEnv` tool. */
export type DescribeFileEnvTool = Tool<DescribeFileEnvInput, { fileAccess: FileAccessInfo }>;

const fileAllowReadSchema = z.union([
  z.array(z.string()),
  z.null(),
  z.literal(UNBOUNDED_ALLOW_READ),
]);

export interface FileToolProviderOptions {
  /** Default sandbox root when a call's context doesn't specify one. */
  root?: string;
  /**
   * Default read bound when a call's context doesn't specify one. Omitted means `[root]`.
   * {@link UNBOUNDED_ALLOW_READ} is host-wide; `null` means nothing can be read.
   */
  allowRead?: FileAllowRead;
  /**
   * Default extra write roots when a call's context doesn't specify any. Omitted — writes
   * stay inside `root` only. `[]` — no writes. A list — intersection with `root`.
   */
  allowWrite?: string[];
  /** Default deny-read paths when a call's context doesn't specify any. */
  denyRead?: string[];
  /** Default read byte cap when a call's context doesn't specify one. */
  maxReadBytes?: number;
  /** Default write byte cap when a call's context doesn't specify one. */
  maxWriteBytes?: number;
}

export interface FileToolProviderContext {
  /** Overrides `options.root` for this call. */
  root?: string;
  /**
   * Overrides `options.allowRead` for this call. Omitted means `[root]` (when options also
   * omit it). {@link UNBOUNDED_ALLOW_READ} is host-wide; `null` means nothing can be read.
   */
  allowRead?: FileAllowRead;
  /**
   * Overrides `options.allowWrite` for this call. Omitted keeps the options default
   * (root-only when both omit). `[]` — no writes.
   */
  allowWrite?: string[];
  /** Overrides `options.denyRead` for this call. */
  denyRead?: string[];
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

function cacheKey(
  root: string,
  maxReadBytes: number,
  maxWriteBytes: number,
  allowRead: FileAllowRead | undefined,
  denyRead: readonly string[] | undefined,
  allowWrite: readonly string[] | undefined,
): string {
  const read =
    allowRead === undefined
      ? "default-root"
      : allowRead === UNBOUNDED_ALLOW_READ
        ? "unbounded"
        : allowRead === null
          ? "none"
          : allowRead.join("\0");
  // Omitted allowWrite (root-only) must not share a cache slot with [] (no writes).
  const write = allowWrite === undefined ? "omit" : `list:${allowWrite.join("\0")}`;
  return `${root}::${maxReadBytes}::${maxWriteBytes}::${read}::${(denyRead ?? []).join("\0")}::${write}`;
}

/**
 * `ToolProvider` wrapping `createFileTools` so `root`/`allowRead`/`maxReadBytes`/`maxWriteBytes`
 * can be set per `agent.run()` call via `toolProviderContext` (set by the workflow/host, not
 * the model) instead of being fixed at construction time. Caches the constructed `FileTools`
 * (and its `FileJail`'s cached `realpath` promise) per distinct resolved
 * `(root, allowRead, denyRead, maxReadBytes, maxWriteBytes)` combination, since the common
 * case is the same combination recurring across many calls in one run.
 */
export function createFileToolProvider(
  options: FileToolProviderOptions,
): ToolProvider<FileProviderTools, FileToolProviderContext | undefined> {
  const cache = new Map<string, FileTools>();

  return {
    contextSchema: z
      .object({
        root: z.string(),
        allowRead: fileAllowReadSchema,
        allowWrite: z.array(z.string()),
        denyRead: z.array(z.string()),
        maxReadBytes: z.number(),
        maxWriteBytes: z.number(),
      })
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
      const context = ctx.toolProviderContext;
      const allowRead =
        context && Object.hasOwn(context, "allowRead") ? context.allowRead : options.allowRead;
      const allowWrite = ctx.toolProviderContext?.allowWrite ?? options.allowWrite;
      const denyRead = ctx.toolProviderContext?.denyRead ?? options.denyRead;

      const resolvedRoot = path.resolve(root);
      const key = cacheKey(
        resolvedRoot,
        maxReadBytes,
        maxWriteBytes,
        allowRead,
        denyRead,
        allowWrite,
      );
      let fileTools = cache.get(key);
      if (!fileTools) {
        fileTools = createFileTools({
          root: resolvedRoot,
          allowRead,
          allowWrite,
          denyRead,
          maxReadBytes,
          maxWriteBytes,
        });
        cache.set(key, fileTools);
      }

      const describeFileEnv: DescribeFileEnvTool = tool({
        description: describeFileEnvDescription,
        inputSchema: describeFileEnvInputSchema,
        execute: async () => ({
          fileAccess: describeFileAccess(
            resolvedRoot,
            maxReadBytes,
            maxWriteBytes,
            allowRead,
            denyRead,
          ),
        }),
      });

      return { ...fileTools, describeFileEnv };
    },
  };
}
