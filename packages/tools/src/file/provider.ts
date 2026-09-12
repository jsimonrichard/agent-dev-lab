import path from "node:path";

import {
  AdlError,
  tool,
  type Tool,
  type ToolProvider,
  type ToolProviderToolSummary,
} from "@agent-dev-lab/core";
import { z } from "zod";

import { resolveAllowWriteList, resolveDenyList } from "../fs-bounds.ts";
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
  /** Relative-path base and omit-default for allow lists. */
  root: string;
  /**
   * Paths `readFile` may read, or {@link UNBOUNDED_ALLOW_READ} when reads are not confined.
   * Always the resolved default — omitted `allowRead` reports `[root]`; `null` reports `[]`.
   */
  allowRead: ModelAllowRead;
  /** Paths hidden from `readFile`. Empty when the caller set none. */
  denyRead: string[];
  /**
   * Paths `writeFile` / `editFile` may write. Omitted factory `allowWrite` reports `[root]`;
   * `[]` reports no writes.
   */
  allowWrite: string[];
  /** Paths denied for writes. Empty when the caller set none. */
  denyWrite: string[];
  maxReadBytes: number;
  maxWriteBytes: number;
}

/**
 * Report the bounds actually in effect after factory resolution.
 * Pass factory-level values (including omitted / {@link UNBOUNDED_ALLOW_READ}); this applies
 * the same `[root]` defaults `createFileTools` does.
 */
export function describeFileAccess(
  root: string,
  maxReadBytes: number,
  maxWriteBytes: number,
  allowRead?: FileAllowRead,
  denyRead?: readonly string[] | null,
  allowWrite?: readonly string[] | undefined,
  denyWrite?: readonly string[] | null,
): FileAccessInfo {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    allowRead: resolveFileAllowRead(resolvedRoot, allowRead),
    denyRead: resolveDenyList(denyRead),
    allowWrite: resolveAllowWriteList({
      anchor: resolvedRoot,
      allowWrite: allowWrite === undefined ? undefined : [...allowWrite],
    }),
    denyWrite: resolveDenyList(denyWrite),
    maxReadBytes,
    maxWriteBytes,
  };
}

const describeFileEnvDescription =
  "Report the file sandbox root, read/write allow and deny lists, and byte caps.";

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
  /** Default relative-path base when a call's context doesn't specify one. */
  root?: string;
  /**
   * Default read bound when a call's context doesn't specify one. Omitted means `[root]`.
   * {@link UNBOUNDED_ALLOW_READ} is host-wide; `null` means nothing can be read.
   */
  allowRead?: FileAllowRead;
  /**
   * Default write allow list when a call's context doesn't specify any. Omitted → `[root]`.
   * `[]` — no writes.
   */
  allowWrite?: string[];
  /** Default deny-read paths when a call's context doesn't specify any. */
  denyRead?: string[];
  /** Default deny-write paths when a call's context doesn't specify any. */
  denyWrite?: string[];
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
   * (`[root]` when both omit). `[]` — no writes.
   */
  allowWrite?: string[];
  /** Overrides `options.denyRead` for this call. */
  denyRead?: string[];
  /** Overrides `options.denyWrite` for this call. */
  denyWrite?: string[];
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
  denyWrite: readonly string[] | undefined,
): string {
  const read =
    allowRead === undefined
      ? "default-root"
      : allowRead === UNBOUNDED_ALLOW_READ
        ? "unbounded"
        : allowRead === null
          ? "none"
          : allowRead.join("\0");
  // Omitted allowWrite ([root]) must not share a cache slot with [] (no writes).
  const write = allowWrite === undefined ? "omit" : `list:${allowWrite.join("\0")}`;
  return `${root}::${maxReadBytes}::${maxWriteBytes}::${read}::${(denyRead ?? []).join("\0")}::${write}::${(denyWrite ?? []).join("\0")}`;
}

/**
 * `ToolProvider` wrapping `createFileTools` so `root`/`allowRead`/`maxReadBytes`/`maxWriteBytes`
 * can be set per `agent.run()` call via `toolProviderContext` (set by the workflow/host, not
 * the model) instead of being fixed at construction time. Caches the constructed `FileTools`
 * (and its `FileJail`'s cached `realpath` promise) per distinct resolved policy combination,
 * since the common case is the same combination recurring across many calls in one run.
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
        denyWrite: z.array(z.string()),
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
      const denyWrite = ctx.toolProviderContext?.denyWrite ?? options.denyWrite;

      const resolvedRoot = path.resolve(root);
      const key = cacheKey(
        resolvedRoot,
        maxReadBytes,
        maxWriteBytes,
        allowRead,
        denyRead,
        allowWrite,
        denyWrite,
      );
      let fileTools = cache.get(key);
      if (!fileTools) {
        fileTools = createFileTools({
          root: resolvedRoot,
          allowRead,
          allowWrite,
          denyRead,
          denyWrite,
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
            allowWrite,
            denyWrite,
          ),
        }),
      });

      return { ...fileTools, describeFileEnv };
    },
  };
}
