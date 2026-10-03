import { describe, expect, it } from "bun:test";

import { createAdlRuntime, inMemoryWorkflowStore } from "../index";
import { composeEffectHandlers, parkingEffectGate } from "./index";
import type { EffectIntent, SuspendHandle } from "./types";

function sampleIntent(): EffectIntent {
  return {
    id: "eff_1",
    kind: "tool",
    reversibility: "compensable",
    workflowRunId: "run_1",
    payload: { toolName: "bash", input: { command: "ls" } },
  };
}

describe("parkingEffectGate", () => {
  it("persists suspend and returns the resolved decision", async () => {
    const store = inMemoryWorkflowStore();
    await store.recordEvent({
      type: "workflow_started",
      workflowRunId: "run_1",
      workflowId: "demo",
      input: {},
      runSeq: 1,
      at: "2026-01-01T00:00:00.000Z",
      eventSchemaVersion: 1,
    });

    const handle: SuspendHandle = {
      id: "sus_1",
      intentId: "eff_1",
      workflowRunId: "run_1",
      reason: "policy",
      createdAt: "2026-01-01T00:00:01.000Z",
    };
    const inner = composeEffectHandlers([
      {
        onIntent() {
          return Promise.resolve({ action: "suspend" as const, handle });
        },
      },
    ]);
    const gate = parkingEffectGate(inner, { store });
    const parked = gate.handle(sampleIntent());
    const started = Date.now();
    while ((await store.getRun("run_1"))?.status !== "suspended" && Date.now() - started < 5_000) {
      await Bun.sleep(20);
    }
    expect((await store.getRun("run_1"))?.status).toBe("suspended");
    await store.resolveSuspend("sus_1", { action: "deny", reason: "nope" });
    await expect(parked).resolves.toEqual({ action: "deny", reason: "nope" });
  });
});

describe("requestApproval", () => {
  it("denies by throwing after resolve", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "approval-deny",
      run: async (_input, ctx) => {
        await ctx.requestApproval({ message: "go?" });
        return { ok: true };
      },
    });
    const handle = workflow.run({});
    const started = Date.now();
    while (
      (await store.getRun(handle.workflowRunId))?.status !== "suspended" &&
      Date.now() - started < 5_000
    ) {
      await Bun.sleep(20);
    }
    expect((await store.getRun(handle.workflowRunId))?.status).toBe("suspended");
    const pending = await store.listPendingSuspends({ workflowRunId: handle.workflowRunId });
    await store.resolveSuspend(pending[0]!.handle.id, { action: "deny", reason: "stop" });
    await expect(handle.result).rejects.toThrow(/Approval denied: stop/);
  });
});
