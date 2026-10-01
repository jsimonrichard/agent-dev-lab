import { describe, expect, it } from "bun:test";

import { createOnceAsync } from "./once-async";

describe("createOnceAsync", () => {
  it("runs the task once when callers overlap", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const once = createOnceAsync(async () => {
      runs += 1;
      await gate;
    });

    const first = once();
    const second = once();
    release();
    await Promise.all([first, second]);

    expect(runs).toBe(1);
  });

  it("retries after a failed attempt", async () => {
    let runs = 0;
    const once = createOnceAsync(async () => {
      runs += 1;
      if (runs === 1) {
        throw new Error("boom");
      }
    });

    await expect(once()).rejects.toThrow("boom");
    await once();
    expect(runs).toBe(2);
  });
});
