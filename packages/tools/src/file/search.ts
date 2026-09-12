import { AdlError, tool, type Tool } from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor, BashExecutorUpdate } from "../bash/executor.ts";
import { DEFAULT_TIMEOUT_MS } from "../bash/tools.ts";
import { createFileJail } from "./jail.ts";

/** Also used by `createWorkspaceToolProvider`'s `listTools`. */
export const GREP_DESCRIPTION =
  "Search file contents for a literal string. Optional in-root `path` and `glob` filter; no flags.";

export const GLOB_DESCRIPTION = "List files whose paths match a glob. No flags.";

export interface SearchToolsOptions {
  /**
   * Isolation strategy — required: this tool never picks an executor, and there's no
   * unsandboxed default.
   */
  executor: BashExecutor;
  /** Directory every search path is confined to. */
  root: string;
  /** Wall-clock timeout per search, in milliseconds. Default 30,000 (30s). */
  timeoutMs?: number;
}

export type SearchToolResult = BashExecutorUpdate;

export interface SearchTools {
  grep: Tool<{ pattern: string; path?: string; glob?: string }, SearchToolResult>;
  glob: Tool<{ pattern: string }, SearchToolResult>;
}

/**
 * Fixed `rg` argv. The model supplies only the pattern and an in-root path/glob — never
 * flags. `--` keeps a pattern that starts with `-` from being parsed as a flag.
 */
export function grepArgv(pattern: string, searchPath: string, glob?: string): string[] {
  const argv = ["rg", "--color=never", "--line-number", "--no-heading", "--fixed-strings"];
  if (glob !== undefined) {
    argv.push("--glob", glob);
  }
  argv.push("--", pattern, searchPath);
  return argv;
}

/** `rg --files` filtered by `--glob`. Search path is always the jail-resolved root. */
export function globArgv(pattern: string, searchPath: string): string[] {
  return ["rg", "--files", "--color=never", "--glob", pattern, "--", searchPath];
}

/**
 * `grep` / `glob` tools jailed to `options.root` and run through `options.executor` as
 * argv — the pattern is never interpolated into a shell string.
 */
export function createSearchTools(options: SearchToolsOptions): SearchTools {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new AdlError(
      "INVALID_INPUT",
      `SearchToolsOptions.timeoutMs must be positive, got ${timeoutMs}`,
    );
  }
  const jail = createFileJail(options.root);

  return {
    grep: tool({
      description: GREP_DESCRIPTION,
      inputSchema: z.object({
        pattern: z
          .string()
          .min(1)
          .describe("Literal string to search for. Never interpolated into a shell."),
        path: z
          .string()
          .optional()
          .describe("Path relative to the sandbox root. Defaults to the root itself."),
        glob: z
          .string()
          .optional()
          .describe("Optional glob filter (ripgrep `--glob`). Not a flag."),
      }),
      execute: async function* ({ pattern, path: requestedPath, glob }, { abortSignal }) {
        const searchPath = await jail.resolveExisting(requestedPath ?? ".");
        yield* options.executor.run(grepArgv(pattern, searchPath, glob), {
          cwd: jail.root,
          timeoutMs,
          signal: abortSignal,
        });
      },
    }),

    glob: tool({
      description: GLOB_DESCRIPTION,
      inputSchema: z.object({
        pattern: z.string().min(1).describe("Glob of files to list, relative to the sandbox root."),
      }),
      execute: async function* ({ pattern }, { abortSignal }) {
        const searchPath = await jail.resolveExisting(".");
        yield* options.executor.run(globArgv(pattern, searchPath), {
          cwd: jail.root,
          timeoutMs,
          signal: abortSignal,
        });
      },
    }),
  };
}
