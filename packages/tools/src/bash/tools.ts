import { AdlError, tool, type Tool } from "@agent-dev-lab/core";
import { z } from "zod";

import type { BashExecutor, BashExecutorUpdate } from "./executor";

export const DEFAULT_TIMEOUT_MS = 30_000;

/** The `bash` tool's description — also used by `createBashToolProvider`'s `listTools`. */
export const BASH_TOOL_DESCRIPTION =
  "Run a shell command in a sandboxed working directory. Returns stdout, stderr, and exit " +
  "code — a non-zero exit code is not itself a tool error.";

export interface BashToolOptions {
  /**
   * Isolation strategy. Required: this
   * tool never picks an executor on its own, and there's no unsandboxed default.
   */
  executor: BashExecutor;
  /** Working directory every command runs in. */
  cwd: string;
  /** Wall-clock timeout per command, in milliseconds. Default 30,000 (30s). */
  timeoutMs?: number;
}

/** Re-exported under this package's own name — see {@link BashExecutorUpdate}'s doc comment
 * for what `done: false` vs `done: true` mean. */
export type BashToolResult = BashExecutorUpdate;

/** Named return type, not bare `ToolSet` — see the same note on `FileTools`. */
export interface BashTools {
  bash: Tool<{ command: string }, BashToolResult>;
}

/**
 * `bash` tool: runs a shell command through `options.executor`. `execute` returns the
 * executor's own generator directly (`yield*`-compatible with the AI SDK's tool `execute`
 * contract — see `BashExecutor.run`'s doc comment) rather than awaiting to a single value, so
 * progress updates stream through as `preliminary` tool results and the final one lands as the
 * ordinary, non-preliminary result.
 *
 * A non-zero exit code is data on the final result (`{ done: true, exitCode, stdout, stderr,
 * ... }`), not a thrown error — a failing command (a grep with no matches, a failing test run)
 * is meaningful information for the model, not a tool-call error. `execute` only throws for
 * infrastructure failures — the executor's own sandbox couldn't start, a missing prerequisite,
 * a spawn error.
 */
export function createBashTool(options: BashToolOptions): BashTools {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new AdlError(
      "INVALID_INPUT",
      `BashToolOptions.timeoutMs must be positive, got ${timeoutMs}`,
    );
  }

  return {
    bash: tool({
      description: BASH_TOOL_DESCRIPTION,
      inputSchema: z.object({
        command: z.string().min(1).describe("The shell command to run."),
      }),
      execute: ({ command }, { abortSignal }) =>
        options.executor.run(["/bin/bash", "-c", command], {
          cwd: options.cwd,
          timeoutMs,
          signal: abortSignal,
        }),
    }),
  };
}
