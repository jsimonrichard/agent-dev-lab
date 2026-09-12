import type { AdlErrorCode } from "@agent-dev-lab/core";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

import type { BashExecutorUpdate } from "../executor.ts";

/**
 * NDJSON messages between `createAsrtBashExecutor` (host) and `supervisor.ts`.
 * Stdin is also the keepalive: the supervisor exits when the host closes it (parent death
 * included — the kernel closes the pipe).
 */

export type AsrtSupervisorRequest =
  | {
      id: string;
      type: "init";
      config: SandboxRuntimeConfig;
      /** Host env vars allowed into sandboxed commands (already resolved; no RegExp). */
      sandboxEnv: Record<string, string>;
    }
  | {
      id: string;
      type: "run";
      argv: readonly string[];
      cwd: string;
      timeoutMs: number;
      maxOutputBytes: number;
    }
  | { id: string; type: "abort" }
  | { id: string; type: "shutdown" };

export type AsrtSupervisorEvent =
  | { id: string; type: "ready" }
  | { id: string; type: "update"; update: BashExecutorUpdate }
  | { id: string; type: "error"; code?: AdlErrorCode; message: string }
  | { id: string; type: "bye" };

export function writeNdjson(stream: NodeJS.WritableStream, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

export function attachNdjsonReader(
  stream: NodeJS.ReadableStream,
  onMessage: (value: unknown) => void,
  onError: (error: Error) => void,
): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        try {
          onMessage(JSON.parse(line) as unknown);
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
          return;
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
}
