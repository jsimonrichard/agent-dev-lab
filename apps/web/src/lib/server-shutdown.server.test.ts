import { afterEach, describe, expect, it } from "bun:test";

import {
  beginGracefulShutdown,
  forceShutdown,
  getServerShutdownSignal,
  registerShutdownRunHooks,
  resetServerShutdownForTests,
} from "./server-shutdown.server";

describe("server shutdown drain / force", () => {
  const originalExit = process.exit;

  afterEach(() => {
    process.exit = originalExit;
    resetServerShutdownForTests();
  });

  it("waits for active runs on graceful shutdown and cancels on force", async () => {
    resetServerShutdownForTests();
    let exited: number | undefined;
    process.exit = ((code?: number) => {
      exited = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    let active = 1;
    let cancelled = false;
    const log: string[] = [];

    registerShutdownRunHooks({
      activeCount: () => active,
      waitForActive: async () => {
        log.push("wait");
        await gate;
        log.push("wait-done");
      },
      cancelActive: () => {
        log.push("cancel");
        cancelled = true;
        active = 0;
        resolveGate();
      },
    });

    expect(getServerShutdownSignal().aborted).toBe(false);

    beginGracefulShutdown();
    await new Promise((r) => setTimeout(r, 20));
    expect(log).toEqual(["wait"]);
    expect(cancelled).toBe(false);
    expect(getServerShutdownSignal().aborted).toBe(false);

    forceShutdown();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(cancelled).toBe(true);
    expect(log).toContain("cancel");
    expect(log).toContain("wait-done");
    expect(getServerShutdownSignal().aborted).toBe(true);
    expect(exited).toBe(0);
  });

  it("releases immediately when nothing is running", async () => {
    resetServerShutdownForTests();
    let exited: number | undefined;
    process.exit = ((code?: number) => {
      exited = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    registerShutdownRunHooks({
      activeCount: () => 0,
      waitForActive: async () => {},
      cancelActive: () => {},
    });

    beginGracefulShutdown();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(getServerShutdownSignal().aborted).toBe(true);
    expect(exited).toBe(0);
  });
});
