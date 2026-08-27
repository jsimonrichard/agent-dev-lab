import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** SQLite stores import `bun:sqlite`; Node cannot load them. */
export function isBunRuntime(versions: NodeJS.ProcessVersions = process.versions): boolean {
  return Boolean(versions.bun);
}

export function bunRelaunchArgs(execUrl: string, argv: readonly string[]): string[] {
  return ["--bun", fileURLToPath(execUrl), ...argv.slice(2)];
}

export function relaunchUnderBun(execUrl: string, proc: NodeJS.Process): never {
  const result = spawnSync("bun", bunRelaunchArgs(execUrl, proc.argv), {
    stdio: "inherit",
    env: proc.env,
  });
  if (result.error) {
    throw new Error(
      `ADL requires the Bun runtime (SQLite stores import bun:sqlite). Failed to spawn bun: ${result.error.message}`,
    );
  }
  proc.exit(result.status ?? 1);
}
