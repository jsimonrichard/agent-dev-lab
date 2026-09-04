import { readFile, stat, writeFile } from "node:fs/promises";

import { AdlError, tool, type Tool } from "@agent-dev-lab/core";
import { z } from "zod";

import { createFileJail } from "./jail";

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
   * Directory every path is confined to. Resolved (and symlink-checked) lazily on first
   * tool call, not at `createFileTools` time — see `notes/tool-sandboxing.md`.
   */
  root: string;
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
 * `readFile`/`writeFile`/`editFile` tools jailed to `options.root` — no path may resolve
 * (after symlink resolution) outside it. There is **no zero-config unsafe default**: `root`
 * is required, matching `notes/tool-sandboxing.md`'s "tie dangerous tools to a sandbox
 * structurally" principle.
 *
 * `editFile` is a find/replace, not a diff format: it fails unless `find` appears exactly
 * once in the file, so an ambiguous edit is rejected rather than guessed at (same reasoning
 * as this repo's own editing tool).
 *
 * Writing a file requires its parent directory to already exist — this first increment does
 * not create intermediate directories, since doing so safely (without a symlink defeating the
 * jail partway through) needs a level-by-level check this package doesn't implement yet.
 */
/** Named return type (rather than bare `ToolSet`) so destructuring a single tool out doesn't
 * trip `noUncheckedIndexedAccess` the way indexing into a `Record<string, Tool>` would. */
export interface FileTools {
  readFile: Tool<{ path: string }, { content: string }>;
  writeFile: Tool<{ path: string; content: string }, { bytesWritten: number }>;
  editFile: Tool<{ path: string; find: string; replace: string }, { bytesWritten: number }>;
}

export function createFileTools(options: FileToolsOptions): FileTools {
  const jail = createFileJail(options.root);
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_MAX_BYTES;
  const maxWriteBytes = options.maxWriteBytes ?? DEFAULT_MAX_BYTES;

  async function assertReadable(resolved: string, requestedPath: string): Promise<void> {
    const info = await stat(resolved);
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
        path: z.string().describe("Path relative to the sandbox root."),
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
        const resolved = await jail.resolveExisting(requestedPath);
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
