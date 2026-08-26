import { describe, expect, it } from "bun:test";

import { createAdlProjectReloadGate } from "./reload-gate";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("createAdlProjectReloadGate", () => {
  it("runs reload again when a change arrives during an in-flight reload", async () => {
    let reloads = 0;
    let releaseFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const gate = createAdlProjectReloadGate({
      debounceMs: 1,
      reload: async () => {
        reloads += 1;
        if (reloads === 1) {
          await first;
        }
      },
    });

    gate.schedule("a.ts");
    await wait(15);
    expect(reloads).toBe(1);

    gate.schedule("b.ts");
    releaseFirst();
    await wait(30);
    expect(reloads).toBe(2);
    gate.dispose();
  });

  it("does not emit onReload after dispose", async () => {
    let emitted = 0;
    const gate = createAdlProjectReloadGate({
      debounceMs: 1,
      reload: async () => {},
      onReload: () => {
        emitted += 1;
      },
    });

    gate.schedule("a.ts");
    gate.dispose();
    await wait(20);
    expect(emitted).toBe(0);
  });

  it("does not emit onReload for an in-flight reload after dispose", async () => {
    let emitted = 0;
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const gate = createAdlProjectReloadGate({
      debounceMs: 1,
      reload: async () => {
        await blocked;
      },
      onReload: () => {
        emitted += 1;
      },
    });

    gate.schedule("a.ts");
    await wait(15);
    gate.dispose();
    release();
    await wait(20);
    expect(emitted).toBe(0);
  });
});
