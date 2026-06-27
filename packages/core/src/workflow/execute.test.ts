import { describe, expect, it } from "bun:test";

import { createAdlRuntime, createWorkflow, inMemoryWorkflowStore } from "../index";

describe("workflow.run", () => {
  it("runs steps and records events in the workflow store", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow(runtime, {
      id: "counter",
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

    const workflow = createWorkflow(runtime, {
      id: "cacheable",
      run: async (_input, ctx) => {
        await ctx.step("work", async () => {
          computeCount += 1;
          return "done";
        });
        return null;
      },
    });

    const first = workflow.run(null);
    await first.result;
    expect(computeCount).toBe(1);

    const second = workflow.run(null, { workflowRunId: first.workflowRunId });
    await second.result;
    expect(computeCount).toBe(1);

    const skipped = await store.listEvents(
      { workflowRunId: first.workflowRunId },
      { type: "step_skipped" },
    );
    expect(skipped.length).toBeGreaterThanOrEqual(1);
  });

  it("requires distinct keys for repeated step names", async () => {
    const runtime = createAdlRuntime();
    const workflow = createWorkflow(runtime, {
      id: "keys",
      run: async (_input, ctx) => {
        await ctx.step("dup", async () => 1);
        await ctx.step("dup", async () => 2);
      },
    });

    await expect(workflow.run(null).result).rejects.toThrow(/key is required/);
  });

  it("nests under the active workflow context when parentCtx is omitted", async () => {
    const runtime = createAdlRuntime();
    const child = createWorkflow(runtime, {
      id: "child",
      run: async () => ({ nested: true }),
    });
    let childRunId: string | undefined;
    const parent = createWorkflow(runtime, {
      id: "parent",
      run: async (_input, ctx) =>
        ctx.step("invoke-child", async () => {
          const handle = child.run({});
          childRunId = handle.workflowRunId;
          return handle.result;
        }),
    });

    const parentHandle = parent.run({});
    const output = await parentHandle.result;

    expect(output).toEqual({ nested: true });
    expect(childRunId).toBe(parentHandle.workflowRunId);
  });

  it("stream yields run events for the workflow run", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow(runtime, {
      id: "stream-demo",
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
