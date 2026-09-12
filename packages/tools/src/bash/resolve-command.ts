import { existsSync } from "node:fs";
import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

/**
 * Resolve a bare command name to an absolute path by walking `process.env.PATH`.
 * Manual walk — Bun's `spawn`/`spawnSync` still find commands on the ambient PATH even when
 * the spawn `env` clears `PATH` (Node does not); an absolute path is deterministic on both.
 */
export function resolveCommandOnPath(command: string): string {
  if (command.includes(path.sep) || (path.sep !== "/" && command.includes("/"))) {
    if (!existsSync(command)) {
      throw new AdlError("INIT_FAILED", `Command not found: ${command}`);
    }
    return path.resolve(command);
  }
  const pathEnv = process.env.PATH ?? "";
  for (const segment of pathEnv.split(path.delimiter).filter((s) => s.length > 0)) {
    const candidate = path.join(segment, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new AdlError(
    "INIT_FAILED",
    `${command} not found on PATH. Install it, or ensure PATH includes its directory.`,
  );
}
