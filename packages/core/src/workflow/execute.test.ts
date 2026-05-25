import { describe, expect, it } from "bun:test";

import { createId } from "../internal/ids";
import { RunRecorder } from "../runtime/run-recorder";
import { createAdlRuntime, createWorkflow, inMemoryWorkflowStore } from "../index";
import { createWorkflowContext } from "./context";
import { getWorkflowImpl } from "./workflow-impl";

describe("workflow.run", () => {
  it("runs steps and records events in the workflow store", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow({
      id: "counter",
      runtime,
      run: async (_input, ctx) => {
        const a = await ctx.step("first", async () => 1);
        const b = await ctx.step("second", async () => a + 1);
        return { sum: b };
      },
    });

    const handle = workflow.run({});
    const output = await handle.result;

    expect(output).toEqual({ sum: 2 });
    expect(handle.workflowRunId).toBeTruthy();

    const runs = await store.listRuns({ workflowId: "counter" });
    expect(runs).toHaveLength(1);
    const runEvents = await store.listEvents({ workflowRunId: runs[0]!.workflowRunId });
    expect(runEvents.some((e) => e.type === "workflow_started")).toBe(true);
    expect(runEvents.some((e) => e.type === "step_started")).toBe(true);
    expect(runEvents.some((e) => e.type === "step_finished")).toBe(true);
    expect(runEvents.some((e) => e.type === "workflow_finished")).toBe(true);
  });

  it("skips completed steps when re-run with the same workflow context", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    let computeCount = 0;

    const workflow = createWorkflow({
      id: "cacheable",
      runtime,
      run: async (_input, ctx) => {
        await ctx.step("work", async () => {
          computeCount += 1;
          return "done";
        });
        return null;
      },
    });
    const impl = getWorkflowImpl(workflow);

    const workflowRunId = createId();
    const ctx = createWorkflowContext({
      workflowRunId,
      services: runtime.services,
      stepId: null,
      parentStepId: null,
      stepPath: [],
      registryParentKey: workflowRunId,
      runRecorder: new RunRecorder(runtime.services),
    });
    await impl.executeRun(null, { parentCtx: ctx });
    expect(computeCount).toBe(1);

    await impl.executeRun(null, { parentCtx: ctx });
    expect(computeCount).toBe(1);

    const skipped = await store.listEvents(
      { workflowRunId: ctx.workflowRunId },
      { type: "step_skipped" },
    );
    expect(skipped.length).toBeGreaterThanOrEqual(1);
  });

  it("requires distinct keys for repeated step names", async () => {
    const runtime = createAdlRuntime();
    const workflow = createWorkflow({
      id: "keys",
      runtime,
      run: async (_input, ctx) => {
        await ctx.step("dup", async () => 1);
        await ctx.step("dup", async () => 2);
      },
    });

    await expect(workflow.run(null).result).rejects.toThrow(/key is required/);
  });

  it("stream yields run events for the workflow run", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow({
      id: "stream-demo",
      runtime,
      run: async (_input, ctx) => {
        await ctx.step("only", async () => "ok");
        return { done: true };
      },
    });

    const handle = workflow.stream({});
    const collected: string[] = [];
    for await (const event of handle.events) {
      collected.push(event.type);
    }
    const output = await handle.result;

    expect(output).toEqual({ done: true });
    expect(collected).toContain("workflow_started");
    expect(collected).toContain("step_started");
    expect(collected).toContain("workflow_finished");
  });
});
