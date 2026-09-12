import { readFile, stat, writeFile } from "node:fs/promises";

import { AdlError, tool, type Tool } from "@agent-dev-lab/core";
import { z } from "zod";

import { createFileJail, type FileAllowRead } from "./jail.ts";

export { resolveFileAllowRead, type FileAllowRead } from "./jail.ts";

export const DEFAULT_MAX_BYTES = 1_000_000;

/** File tool descriptions — also used by `createFileToolProvider`'s `listTools`. */
export const READ_FILE_DESCRIPTION = "Read a UTF-8 text file.";
export const WRITE_FILE_DESCRIPTION =
  "Write a UTF-8 text file, overwriting it if it exists. Parent directory must already exist.";
export const EDIT_FILE_DESCRIPTION =
  "Replace one exact occurrence of `find` with `replace` in a text file. Fails if `find` " +
  "isn't unique — add more context.";

export interface FileToolsOptions {
  /**
   * Relative-path base and omit-default for allow lists (passed to the jail as `cwd`).
   * Required so factories do not silently fall back to the home directory.
   */
  root: string;
  /**
   * Directories `readFile` may read. Omitted defaults to `[root]` (same as
   * {@link createFileJail}). {@link import("../unbounded-allow-read.ts").UNBOUNDED_ALLOW_READ}
   * is host-wide. `null` (or `[]`) means nothing can be read. A list is exactly those
   * roots — `root` is not inserted. `denyRead` still wins.
   */
  allowRead?: FileAllowRead;
  /**
   * Write allow list. Omitted → `[root]`. `[]` — no writes. A list is exactly those roots
   * (no intersection with a privileged root).
   */
  allowWrite?: string[];
  /** Paths hidden from `readFile`, even when they sit inside `root` or `allowRead`. */
  denyRead?: string[];
  /** Paths `writeFile` / `editFile` may not write, even under `allowWrite`. */
  denyWrite?: string[];
  /** Refuse to read a file over this many bytes. Default 1,000,000 (1 MB). */
  maxReadBytes?: number;
  /** Refuse to write more than this many bytes. Default 1,000,000 (1 MB). */
  maxWriteBytes?: number;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * `readFile`/`writeFile`/`editFile` tools using `options.root` as the relative-path cwd
 * and the omit-default for allow lists. There is **no zero-config unsafe default**: `root`
 * is required. Pass
 * {@link import("../unbounded-allow-read.ts").UNBOUNDED_ALLOW_READ} for host-wide reads.
 *
 * `editFile` is a find/replace, not a diff format: it fails unless `find` appears exactly
 * once in the file, so an ambiguous edit is rejected rather than guessed at.
 *
 * Writing a file requires its parent directory to already exist — this package does not
 * create intermediate directories, since doing so safely (without a symlink defeating the
 * jail partway through) needs a level-by-level check that is not implemented yet.
 */
/** Named return type (rather than bare `ToolSet`) so destructuring a single tool out doesn't
 * trip `noUncheckedIndexedAccess` the way indexing into a `Record<string, Tool>` would. */
export interface FileTools {
  readFile: Tool<{ path: string }, { content: string }>;
  writeFile: Tool<{ path: string; content: string }, { bytesWritten: number }>;
  editFile: Tool<{ path: string; find: string; replace: string }, { bytesWritten: number }>;
}

export function createFileTools(options: FileToolsOptions): FileTools {
  const jail = createFileJail({
    cwd: options.root,
    allowRead: options.allowRead,
    denyRead: options.denyRead,
    allowWrite: options.allowWrite,
    denyWrite: options.denyWrite,
  });
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_BYTES;
  const maxWriteBytes = options.maxWriteBytes ?? DEFAULT_MAX_BYTES;

  async function assertReadable(resolved: string, requestedPath: string): Promise<void> {
    let info;
    try {
      info = await stat(resolved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AdlError("INVALID_INPUT", `File not found: "${requestedPath}"`, {
          cause: error,
        });
      }
      throw error;
    }
    if (info.isDirectory()) {
      throw new AdlError("INVALID_INPUT", `"${requestedPath}" is a directory, not a file.`);
    }
    if (info.size > maxReadBytes) {
      throw new AdlError(
        "INVALID_INPUT",
        `"${requestedPath}" is ${info.size} bytes, over the ${maxReadBytes}-byte read cap.`,
      );
    }
  }

  function assertWritable(bytes: number): void {
    if (bytes > maxWriteBytes) {
      throw new AdlError(
        "INVALID_INPUT",
        `Refusing to write ${bytes} bytes, over the ${maxWriteBytes}-byte write cap.`,
      );
    }
  }

  return {
    readFile: tool({
      description: READ_FILE_DESCRIPTION,
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path relative to the sandbox root, or an absolute path within allowRead."),
      }),
      execute: async ({ path: requestedPath }) => {
        const resolved = await jail.resolveExisting(requestedPath);
        await assertReadable(resolved, requestedPath);
        return { content: await readFile(resolved, "utf8") };
      },
    }),

    writeFile: tool({
      description: WRITE_FILE_DESCRIPTION,
      inputSchema: z.object({
        path: z.string().describe("Path relative to the sandbox root."),
        content: z.string(),
      }),
      execute: async ({ path: requestedPath, content }) => {
        const bytes = Buffer.byteLength(content, "utf8");
        assertWritable(bytes);
        const resolved = await jail.resolveForWrite(requestedPath);
        await writeFile(resolved, content, "utf8");
        return { bytesWritten: bytes };
      },
    }),

    editFile: tool({
      description: EDIT_FILE_DESCRIPTION,
      inputSchema: z.object({
        path: z.string().describe("Path relative to the sandbox root."),
        find: z.string().min(1),
        replace: z.string(),
      }),
      execute: async ({ path: requestedPath, find, replace }) => {
        const resolved = await jail.resolveForWrite(requestedPath);
        await assertReadable(resolved, requestedPath);
        const original = await readFile(resolved, "utf8");
        const occurrences = countOccurrences(original, find);
        if (occurrences === 0) {
          throw new AdlError("INVALID_INPUT", `"find" text not found in "${requestedPath}".`);
        }
        if (occurrences > 1) {
          throw new AdlError(
            "INVALID_INPUT",
            `"find" text appears ${occurrences} times in "${requestedPath}"; it must be ` +
              `unique. Include more surrounding context.`,
          );
        }
        const updated = original.replace(find, replace);
        const bytes = Buffer.byteLength(updated, "utf8");
        assertWritable(bytes);
        await writeFile(resolved, updated, "utf8");
        return { bytesWritten: bytes };
      },
    }),
  };
}
