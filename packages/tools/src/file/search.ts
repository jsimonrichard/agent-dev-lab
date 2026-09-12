import { AdlError, tool, type Tool } from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor, BashExecutorUpdate } from "../bash/executor.ts";
import { resolveCommandOnPath } from "../bash/resolve-command.ts";
import { DEFAULT_TIMEOUT_MS } from "../bash/tools.ts";
import { createFileJail, type FileAllowRead } from "./jail.ts";

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
  /** Directory relative search paths resolve against. */
  root: string;
  /**
   * Directories `grep`'s `path` may target. Omitted defaults to `[root]`.
   * {@link import("../unbounded-allow-read").UNBOUNDED_ALLOW_READ} is host-wide. `null`
   * (or `[]`) means nothing can be searched. A list is exactly those roots — `root` is
   * not inserted. The executor's own `allowRead` is still the subprocess read boundary.
   */
  allowRead?: FileAllowRead;
  /** Paths rejected as a `grep` `path`, even when they sit inside `root` or `allowRead`. */
  denyRead?: string[];
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
 * `rgPath` is absolute so an empty sandbox `PATH` still finds ripgrep.
 */
export function grepArgv(
  pattern: string,
  searchPath: string,
  glob?: string,
  rgPath = "rg",
): string[] {
  const argv = [rgPath, "--color=never", "--line-number", "--no-heading", "--fixed-strings"];
  if (glob !== undefined) {
    argv.push("--glob", glob);
  }
  argv.push("--", pattern, searchPath);
  return argv;
}

/** `rg --files` filtered by `--glob`. Search path is always the jail-resolved root. */
export function globArgv(pattern: string, searchPath: string, rgPath = "rg"): string[] {
  return [rgPath, "--files", "--color=never", "--glob", pattern, "--", searchPath];
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
  const rgPath = resolveCommandOnPath("rg");
  const jail = createFileJail({
    cwd: options.root,
    allowRead: options.allowRead,
    denyRead: options.denyRead,
    // Search never writes through the jail; keep the write allow at the cwd default.
  });

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
          .describe(
            "Path relative to the sandbox root, or an absolute path within allowRead. " +
              "Defaults to the root itself.",
          ),
        glob: z
          .string()
          .optional()
          .describe("Optional glob filter (ripgrep `--glob`). Not a flag."),
      }),
      execute: async function* ({ pattern, path: requestedPath, glob }, { abortSignal }) {
        const searchPath = await jail.resolveForRead(requestedPath ?? ".");
        yield* options.executor.run(grepArgv(pattern, searchPath, glob, rgPath), {
          cwd: jail.cwd,
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
        const searchPath = await jail.resolveForRead(".");
        yield* options.executor.run(globArgv(pattern, searchPath, rgPath), {
          cwd: jail.cwd,
          timeoutMs,
          signal: abortSignal,
        });
      },
    }),
  };
}
