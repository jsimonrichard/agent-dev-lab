/**
 * Shared abort signal + drain/force protocol for production serve shutdown.
 *
 * Owns SIGINT/SIGTERM for the Nitro serve process (srvx's handlers are removed
 * after listen) so we can notify UIs before tearing down sockets.
 *
 * 1st Ctrl+C: wait for in-flight runs; then notify + close.
 * 2nd Ctrl+C: notify UIs (sync), cancel runs (sync), flush one tick, exit.
 * 3rd Ctrl+C: exit immediately if still hanging.
 */

import http from "node:http";
import https from "node:https";

import { publishServerShutdown } from "#/lib/project-reload-events.server";

const globalKey = "__adlServerShutdown" as const;
const serversKey = "__adlTrackedHttpServers" as const;
const patchedKey = "__adlHttpCreateServerPatched" as const;
const hooksKey = "__adlShutdownRunHooks" as const;
const phaseKey = "__adlShutdownPhase" as const;
const takeoverKey = "__adlShutdownSignalsTakenOver" as const;

export type ShutdownRunHooks = {
  activeCount: () => number;
  waitForActive: () => Promise<void>;
  cancelActive: () => void | Promise<void>;
};

type ShutdownPhase = "idle" | "draining" | "forcing" | "released";

type ShutdownGlobal = typeof globalThis & {
  [globalKey]?: {
    controller: AbortController;
    armed: boolean;
  };
  [serversKey]?: Set<http.Server>;
  [patchedKey]?: boolean;
  [hooksKey]?: ShutdownRunHooks;
  [phaseKey]?: ShutdownPhase;
  [takeoverKey]?: boolean;
};

function state() {
  const g = globalThis as ShutdownGlobal;
  if (!g[globalKey]) {
    g[globalKey] = { controller: new AbortController(), armed: false };
  }
  return g[globalKey];
}

function trackedServers(): Set<http.Server> {
  const g = globalThis as ShutdownGlobal;
  if (!g[serversKey]) {
    g[serversKey] = new Set();
  }
  return g[serversKey];
}

function phase(): ShutdownPhase {
  return (globalThis as ShutdownGlobal)[phaseKey] ?? "idle";
}

function setPhase(next: ShutdownPhase): void {
  (globalThis as ShutdownGlobal)[phaseKey] = next;
}

/** Test-only: clear drain/force phase and SSE abort controller. */
export function resetServerShutdownForTests(): void {
  const g = globalThis as ShutdownGlobal;
  g[phaseKey] = "idle";
  g[globalKey] = {
    controller: new AbortController(),
    armed: g[globalKey]?.armed ?? false,
  };
}

function runHooks(): ShutdownRunHooks | undefined {
  return (globalThis as ShutdownGlobal)[hooksKey];
}

/** Wired from `run-service.server` so shutdown can wait on / cancel live runs. */
export function registerShutdownRunHooks(hooks: ShutdownRunHooks): void {
  (globalThis as ShutdownGlobal)[hooksKey] = hooks;
}

function trackServer(server: http.Server): void {
  const servers = trackedServers();
  servers.add(server);
  server.on("close", () => {
    servers.delete(server);
  });
  // After Nitro/srvx listens, drop its SIGINT handlers so we control teardown order.
  server.once("listening", () => {
    takeOverProcessSignals();
  });
}

/**
 * Patch `http(s).createServer` so we can close idle/all connections and own signals.
 * Must run before Nitro/srvx creates the listener (Nitro plugin startup).
 */
export function installHttpServerTracking(): void {
  const g = globalThis as ShutdownGlobal;
  if (g[patchedKey]) {
    return;
  }
  g[patchedKey] = true;

  const patch = <T extends typeof http.createServer>(create: T): T =>
    function patchedCreateServer(this: unknown, ...args: Parameters<T>): ReturnType<T> {
      const server = (create as unknown as (...a: Parameters<T>) => ReturnType<T>).apply(
        this,
        args,
      );
      trackServer(server as http.Server);
      return server;
    } as unknown as T;

  http.createServer = patch(http.createServer);
  https.createServer = patch(
    https.createServer as unknown as typeof http.createServer,
  ) as typeof https.createServer;
}

function writeShutdown(message: string): void {
  if (typeof process === "undefined" || typeof process.stderr?.write !== "function") {
    return;
  }
  process.stderr.write(`\x1B[2K\r[adl] ${message}\n`);
}

function closeIdleTrackedServers(): void {
  for (const server of trackedServers()) {
    try {
      server.closeIdleConnections?.();
    } catch {
      // ignore
    }
  }
}

function closeAllTrackedServers(): void {
  for (const server of trackedServers()) {
    try {
      server.closeAllConnections?.();
    } catch {
      // ignore
    }
  }
}

function closeListeningServers(): Promise<void> {
  const servers = [...trackedServers()];
  if (servers.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  ).then(() => undefined);
}

function notifyUis(reason: "graceful" | "forced"): void {
  try {
    publishServerShutdown(reason);
  } catch {
    // ignore publish errors
  }
}

function abortSseAndMarkReleased(): void {
  const s = state();
  if (!s.controller.signal.aborted) {
    s.controller.abort();
  }
  closeIdleTrackedServers();
  setPhase("released");
}

/** Graceful path: notify, one-tick flush, then close listen sockets. */
async function releaseHttpGraceful(): Promise<void> {
  if (phase() === "released") {
    return;
  }
  notifyUis("graceful");
  // One event-loop turn so ReadableStream enqueues can flush to the wire.
  await new Promise<void>((resolve) => setImmediate(resolve));
  abortSseAndMarkReleased();
  await closeListeningServers();
}

function exitProcess(): void {
  if (typeof process === "undefined" || typeof process.exit !== "function") {
    return;
  }
  process.exit(0);
}

async function drainActiveRuns(): Promise<void> {
  const hooks = runHooks();
  const count = hooks?.activeCount() ?? 0;
  if (count === 0) {
    writeShutdown("No active runs; closing.");
    await releaseHttpGraceful();
    exitProcess();
    return;
  }

  writeShutdown(
    `Waiting for ${count} active run(s) to finish. Ctrl+C again cancels them; a third exits immediately.`,
  );
  try {
    await hooks!.waitForActive();
  } catch {
    // Individual run failures are persisted; still release HTTP.
  }
  if (phase() === "forcing" || phase() === "released") {
    return;
  }
  writeShutdown("Active runs finished; closing.");
  await releaseHttpGraceful();
  exitProcess();
}

/**
 * Force path: UI notify + cancel are sync; exit on the next tick so the SSE
 * chunk can leave the process without waiting on run settlement.
 */
function forceExitSoon(): void {
  if (phase() === "forcing" || phase() === "released") {
    closeAllTrackedServers();
    exitProcess();
    return;
  }
  setPhase("forcing");

  notifyUis("forced");

  const hooks = runHooks();
  const count = hooks?.activeCount() ?? 0;
  if (count > 0) {
    writeShutdown(`Cancelling ${count} active run(s)… (Ctrl+C again exits immediately)`);
    try {
      void hooks!.cancelActive();
    } catch {
      // ignore
    }
  }
  writeShutdown("Forcing close.");

  setImmediate(() => {
    abortSseAndMarkReleased();
    closeAllTrackedServers();
    for (const server of trackedServers()) {
      try {
        server.close();
      } catch {
        // ignore
      }
    }
    exitProcess();
  });
}

/** First Ctrl+C / SIGTERM: wait for in-flight runs, then release HTTP. */
export function beginGracefulShutdown(): void {
  if (phase() !== "idle") {
    return;
  }
  setPhase("draining");
  void drainActiveRuns();
}

/** Second Ctrl+C: notify + cancel sync, then exit on next tick. */
export function forceShutdown(): void {
  forceExitSoon();
}

function onProcessSignal(): void {
  const current = phase();
  if (current === "idle") {
    beginGracefulShutdown();
    return;
  }
  if (current === "draining") {
    forceShutdown();
    return;
  }
  // Already forcing/released — third Ctrl+C exits immediately.
  writeShutdown("Exiting.");
  closeAllTrackedServers();
  exitProcess();
}

/**
 * Replace Nitro/srvx signal handlers so their force-close cannot kill SSE
 * before our `server_shutdown` event is flushed.
 */
function takeOverProcessSignals(): void {
  const g = globalThis as ShutdownGlobal;
  if (g[takeoverKey] || typeof process === "undefined") {
    return;
  }
  g[takeoverKey] = true;
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  process.on("SIGINT", onProcessSignal);
  process.on("SIGTERM", onProcessSignal);
  state().armed = true;
}

/** Abort when the process receives SIGINT/SIGTERM. */
export function armServerShutdown(): void {
  const s = state();
  if (s.armed) {
    return;
  }
  s.armed = true;
  if (typeof process === "undefined" || typeof process.on !== "function") {
    return;
  }
  process.on("SIGINT", onProcessSignal);
  process.on("SIGTERM", onProcessSignal);
}

export function getServerShutdownSignal(): AbortSignal {
  armServerShutdown();
  return state().controller.signal;
}

/** Run `stop` when the client disconnects or the server is shutting down (HTTP release). */
export function onRequestOrServerShutdown(request: Request, stop: () => void): void {
  const shutdown = getServerShutdownSignal();
  if (request.signal.aborted || shutdown.aborted) {
    stop();
    return;
  }
  request.signal.addEventListener("abort", stop, { once: true });
  shutdown.addEventListener("abort", stop, { once: true });
}
