import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

/** The OS process that holds a run's in-memory closure. Recorded on `*_started` events. */
export type RunOwner = {
  /** Random per process; tells this process apart from an earlier one that reused its pid. */
  processId: string;
  pid: number;
  hostname: string;
};

let current: RunOwner | undefined;

export function currentRunOwner(): RunOwner {
  current ??= { processId: randomUUID(), pid: process.pid, hostname: hostname() };
  return current;
}

/**
 * - `current` — this process; its closures may still be running.
 * - `alive` — another process on this host that still exists.
 * - `gone` — the process exited, or the event predates owners (nothing can resume it).
 * - `unknown` — another host; liveness cannot be checked from here.
 */
export type RunOwnerLiveness = "current" | "alive" | "gone" | "unknown";

export function runOwnerLiveness(owner: RunOwner | undefined): RunOwnerLiveness {
  if (!owner) {
    return "gone";
  }
  const self = currentRunOwner();
  if (owner.processId === self.processId) {
    return "current";
  }
  if (owner.hostname !== self.hostname) {
    return "unknown";
  }
  if (owner.pid === self.pid) {
    return "gone";
  }
  try {
    process.kill(owner.pid, 0);
    return "alive";
  } catch (error) {
    const code = errnoCode(error);
    if (code === "EPERM") {
      return "alive";
    }
    if (code === "ESRCH") {
      return "gone";
    }
    throw error;
  }
}

function errnoCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}
