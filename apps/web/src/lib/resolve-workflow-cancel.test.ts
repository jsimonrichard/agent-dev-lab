import { describe, expect, it } from "bun:test";

import { resolveWorkflowCancel } from "./resolve-workflow-cancel";

describe("resolveWorkflowCancel", () => {
  it("returns the direct active handle cancel", async () => {
    const cancelled: string[] = [];
    const active = new Map([
      [
        "root",
        {
          cancel: () => {
            cancelled.push("root");
          },
        },
      ],
    ]);

    const cancel = await resolveWorkflowCancel("root", active, async () => null);
    expect(cancel).not.toBeNull();
    cancel!();
    expect(cancelled).toEqual(["root"]);
  });

  it("walks to an active ancestor for a nested run id", async () => {
    const cancelled: string[] = [];
    const parents: Record<string, string | null> = {
      child: "mid",
      mid: "root",
      root: null,
    };
    const active = new Map([
      [
        "root",
        {
          cancel: () => {
            cancelled.push("root");
          },
        },
      ],
    ]);

    const cancel = await resolveWorkflowCancel(
      "child",
      active,
      async (id) => parents[id] ?? null,
    );
    expect(cancel).not.toBeNull();
    cancel!();
    expect(cancelled).toEqual(["root"]);
  });

  it("returns null when no active ancestor exists", async () => {
    const cancel = await resolveWorkflowCancel(
      "orphan",
      new Map(),
      async (id) => (id === "orphan" ? "missing-parent" : null),
    );
    expect(cancel).toBeNull();
  });

  it("throws on a parent cycle", async () => {
    const parents: Record<string, string> = { a: "b", b: "a" };
    await expect(
      resolveWorkflowCancel("a", new Map(), async (id) => parents[id] ?? null),
    ).rejects.toThrow(/parent cycle/);
  });
});
