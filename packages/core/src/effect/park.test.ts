import { describe, expect, it } from "bun:test";

import { createAdlRuntime, inMemoryWorkflowStore } from "../index";
import { RunRecorder } from "../runtime/run-recorder";
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
    const recorder = new RunRecorder(createAdlRuntime({ stores: { workflow: store } }).services);
    await recorder.emit({
      type: "workflow_started",
      workflowRunId: "run_1",
      workflowId: "demo",
      input: {},
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
    const gate = parkingEffectGate(inner, { store, recorder });
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

  it("parks parallel approvals on one run and finishes after both resolve", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "approval-parallel",
      run: async (_input, ctx) => {
        await Promise.all([
          ctx.step("left", () => ctx.requestApproval({ message: "left?" })),
          ctx.step("right", () => ctx.requestApproval({ message: "right?" })),
        ]);
        return { ok: true };
      },
    });
    const handle = workflow.run({});
    const started = Date.now();
    let pending = await store.listPendingSuspends({ workflowRunId: handle.workflowRunId });
    while (pending.length < 2 && Date.now() - started < 5_000) {
      await Bun.sleep(20);
      pending = await store.listPendingSuspends({ workflowRunId: handle.workflowRunId });
    }
    expect(pending).toHaveLength(2);
    for (const record of pending) {
      await store.resolveSuspend(record.handle.id, { action: "allow" });
    }
    await expect(handle.result).resolves.toEqual({ ok: true });
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    const seqs = events.map((event) => event.runSeq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(events.filter((event) => event.type === "workflow_resumed")).toHaveLength(2);
  });
});
