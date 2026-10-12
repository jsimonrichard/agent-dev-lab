import { describe, expect, it } from "bun:test";

import { inMemoryWorkflowStore } from "../stores/in-memory-workflow-store";
import { createAdlRuntime } from "../runtime/create";
import { RunRecorder } from "../runtime/run-recorder";
import { continueDebuggerPause, createDebugSession } from "./debug-session";
import { composeEffectHandlers } from "./compose";
import { allowAllHandler } from "./gates";
import { parkingEffectGate } from "./park";
import type { EffectIntent } from "./types";

async function waitForPending(
  store: ReturnType<typeof inMemoryWorkflowStore>,
  workflowRunId: string,
) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const pending = await store.listPendingSuspends({ workflowRunId });
    if (pending.length > 0) {
      return pending;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for pending suspend on ${workflowRunId}`);
}

function stepIntent(workflowRunId: string, path: string[]): EffectIntent {
  return {
    id: `eff-${path.join("-")}`,
    kind: "step",
    reversibility: "compensable",
    workflowRunId,
    stepId: `step-${path.join("-")}`,
    payload: { name: path[path.length - 1], path, phase: "enter" },
  };
}

describe("debug session + workflow store parking", () => {
  it("pause → inspect pending → continue", async () => {
    const store = inMemoryWorkflowStore();
    const recorder = new RunRecorder(createAdlRuntime({ stores: { workflow: store } }).services);
    await recorder.emit({
      type: "workflow_started",
      workflowRunId: "run-1",
      workflowId: "w",
      input: {},
      tags: [],
    });
    const debug = createDebugSession();
    const gate = parkingEffectGate(composeEffectHandlers([debug.handler, allowAllHandler]), {
      store,
      recorder,
    });
    const intent = stepIntent("run-1", ["first"]);
    debug.pause("run-1");

    let settled: unknown;
    const parked = gate.handle(intent).then((decision) => {
      settled = decision;
      return decision;
    });

    const pending = await waitForPending(store, "run-1");
    expect(settled).toBeUndefined();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.handle.reason).toBe("debugger");
    expect(pending[0]?.intent.kind).toBe("step");

    await store.resolveSuspend(pending[0]!.handle.id, { action: "allow" });
    await expect(parked).resolves.toEqual({ action: "allow" });
    expect(await store.listPendingSuspends({ workflowRunId: "run-1" })).toEqual([]);
  });
});

describe("workflow step debugger", () => {
  it("pauses at step enter and continues to completion", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "debug-steps",
      run: async (_input, ctx) => {
        const a = await ctx.step("first", async () => 1);
        const b = await ctx.step("second", async () => a + 1);
        return { sum: b };
      },
    });

    runtime.services.debugSession.pause();
    const handle = workflow.run({});
    const pending = await waitForPending(store, handle.workflowRunId);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.handle.reason).toBe("debugger");
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(events.some((event) => event.type === "workflow_suspended")).toBe(true);
    expect(events.some((event) => event.type === "workflow_finished")).toBe(false);

    runtime.services.debugSession.armStepOver(handle.workflowRunId);
    await store.resolveSuspend(pending[0]!.handle.id, { action: "allow" });

    const next = await waitForPending(store, handle.workflowRunId);
    expect(next).toHaveLength(1);
    await store.resolveSuspend(next[0]!.handle.id, { action: "allow" });

    await expect(handle.result).resolves.toEqual({ sum: 2 });
    const finished = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(finished.some((event) => event.type === "workflow_resumed")).toBe(true);
    expect(finished.some((event) => event.type === "workflow_finished")).toBe(true);
  });

  it("parks on a per-definition workflow store override", async () => {
    const runtimeStore = inMemoryWorkflowStore();
    const overrideStore = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: runtimeStore },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow(
      {
        id: "debug-override-store",
        run: async (_input, ctx) => ctx.step("only", async () => 1),
      },
      { stores: { workflow: overrideStore } },
    );

    runtime.services.debugSession.pause();
    const handle = workflow.run({});
    const pending = await waitForPending(overrideStore, handle.workflowRunId);
    expect(pending[0]?.handle.reason).toBe("debugger");
    expect(await runtimeStore.listPendingSuspends()).toEqual([]);

    await overrideStore.resolveSuspend(pending[0]!.handle.id, { action: "allow" });
    await expect(handle.result).resolves.toBe(1);
  });

  it("records step_failed when the gate denies step entry", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      effectGate: {
        async handle(intent) {
          return intent.kind === "step"
            ? { action: "deny", reason: "steps are off" }
            : { action: "allow" };
        },
      },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "deny-step-entry",
      run: async (_input, ctx) => ctx.step("only", async () => 1),
    });

    const handle = workflow.run({});
    await expect(handle.result).rejects.toThrow(/Step enter denied: steps are off/);
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    const started = events.find((event) => event.type === "step_started");
    const failed = events.find((event) => event.type === "step_failed");
    expect(started).toBeDefined();
    expect(failed && "stepId" in failed ? failed.stepId : undefined).toBe(
      started && "stepId" in started ? started.stepId : undefined,
    );
  });

  it("does not pause when the debugger is idle", async () => {
    const runtime = createAdlRuntime({ loadEnv: false, version: false });
    const workflow = runtime.createWorkflow({
      id: "no-debug",
      run: async (_input, ctx) => {
        await ctx.step("only", async () => 1);
        return { ok: true };
      },
    });
    await expect(workflow.run({}).result).resolves.toEqual({ ok: true });
  });
});

describe("continueDebuggerPause", () => {
  it("resolves a debugger pause and leaves an approval pending", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "approval-under-debugger",
      run: async (_input, ctx) => {
        await ctx.step("first", async () => 1);
        await ctx.requestApproval({ message: "ship it?" });
        return { ok: true };
      },
    });

    runtime.services.debugSession.pause();
    const handle = workflow.run({});
    const paused = await waitForPending(store, handle.workflowRunId);
    expect(paused[0]?.handle.reason).toBe("debugger");

    const continued = await continueDebuggerPause({
      store,
      debugSession: runtime.services.debugSession,
      workflowRunId: handle.workflowRunId,
      mode: "continue",
    });
    expect(continued).toEqual({
      isOk: true,
      isErr: false,
      value: { handleIds: [paused[0]!.handle.id] },
    });

    const approval = await waitForPending(store, handle.workflowRunId);
    expect(approval[0]?.handle.reason).toBe("approval");
    const refused = await continueDebuggerPause({
      store,
      debugSession: runtime.services.debugSession,
      workflowRunId: handle.workflowRunId,
      mode: "continue",
    });
    expect(refused.isErr).toBe(true);
    expect(await store.listPendingSuspends({ workflowRunId: handle.workflowRunId })).toHaveLength(
      1,
    );

    await store.resolveSuspend(approval[0]!.handle.id, { action: "allow" });
    await expect(handle.result).resolves.toEqual({ ok: true });
  });
});
