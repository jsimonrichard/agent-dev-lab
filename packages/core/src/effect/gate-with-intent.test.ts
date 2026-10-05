import { describe, expect, it } from "bun:test";

import { createAdlRuntime, inMemoryWorkflowStore } from "../index";

async function waitForStatus(
  store: ReturnType<typeof inMemoryWorkflowStore>,
  workflowRunId: string,
  status: "suspended" | "ok" | "error",
): Promise<void> {
  const started = Date.now();
  while ((await store.getRun(workflowRunId))?.status !== status) {
    if (Date.now() - started > 5_000) {
      throw new Error(`timed out waiting for ${status} on ${workflowRunId}`);
    }
    await Bun.sleep(10);
  }
}

describe("gateWithIntent (via ctx.step / requestApproval)", () => {
  it("records effect_intent before step enter and effect_settled after allow", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "step-emit",
      run: async (_input, ctx) => {
        await ctx.step("a", async () => 1);
        return {};
      },
    });
    const handle = workflow.run({});
    await handle.result;
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    const types = events.map((event) => event.type);
    const intentIdx = types.indexOf("effect_intent");
    const settledIdx = types.indexOf("effect_settled");
    expect(intentIdx).toBeGreaterThan(-1);
    expect(settledIdx).toBeGreaterThan(intentIdx);
    const intent = events[intentIdx];
    expect(intent?.type).toBe("effect_intent");
    if (intent?.type === "effect_intent") {
      expect(intent.intent.kind).toBe("step");
      expect(intent.intent.stepId).toBeTruthy();
    }
  });

  it("records intent before park and settled after approval resume", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "approval-emit",
      run: async (_input, ctx) => {
        await ctx.requestApproval({ message: "go?" });
        return { ok: true };
      },
    });
    const handle = workflow.run({});
    await waitForStatus(store, handle.workflowRunId, "suspended");
    const mid = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(mid.some((event) => event.type === "effect_intent")).toBe(true);
    expect(mid.some((event) => event.type === "effect_settled")).toBe(false);

    const pending = await store.listPendingSuspends({ workflowRunId: handle.workflowRunId });
    await store.resolveSuspend(pending[0]!.handle.id, { action: "allow" });
    await handle.result;
    const done = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(done.some((event) => event.type === "effect_settled")).toBe(true);
  });

  it("records intent before debugger park and settled after continue", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = runtime.createWorkflow({
      id: "debug-emit",
      run: async (_input, ctx) => {
        await ctx.step("first", async () => 1);
        return { ok: true };
      },
    });
    runtime.services.debugSession.pause();
    const handle = workflow.run({});
    await waitForStatus(store, handle.workflowRunId, "suspended");
    const mid = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(mid.some((event) => event.type === "effect_intent")).toBe(true);
    expect(mid.some((event) => event.type === "workflow_suspended")).toBe(true);
    expect(mid.some((event) => event.type === "effect_settled")).toBe(false);

    const pending = await store.listPendingSuspends({ workflowRunId: handle.workflowRunId });
    await store.resolveSuspend(pending[0]!.handle.id, { action: "allow" });
    await handle.result;
    const done = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(done.some((event) => event.type === "effect_settled")).toBe(true);
  });
});
