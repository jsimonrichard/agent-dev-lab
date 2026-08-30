import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { createAdlRuntime, createWorkflow, inMemoryWorkflowStore } from "../index";

describe("workflow.run", () => {
  it("runs steps and records events in the workflow store", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store }, loadEnv: false });
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

  it("allows destructuring step/emit/setTitle from ctx", async () => {
    const runtime = createAdlRuntime({ loadEnv: false });
    const workflow = createWorkflow(runtime, {
      id: "destructure-ctx",
      run: async (_input, ctx) => {
        const { step, emit, setTitle, memoryScopeWithSuffix } = ctx;
        await setTitle("destructured");
        emit("ping", { ok: true });
        const value = await step("add", async () => 2);
        expect(memoryScopeWithSuffix("notes")).toContain(":notes");
        return { value };
      },
    });

    await expect(workflow.run({}).result).resolves.toEqual({ value: 2 });
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

  it("exposes the input schema for hosts to collect run input", async () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const input = z.object({ topic: z.string().min(1) });
    const workflow = createWorkflow(runtime, {
      id: "typed-input",
      input,
      run: async (value) => value,
    });

    expect(workflow.input).toBe(input);
    expect(workflow.input?.parse({ topic: "CRISPR" })).toEqual({ topic: "CRISPR" });
  });

  it("applies Zod defaults and bounds before the run body", async () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = createWorkflow(runtime, {
      id: "defaulted-steps",
      input: z.object({
        steps: z.number().int().min(1).max(8).default(3),
      }),
      run: async (input) => input.steps,
    });

    await expect(workflow.run({}).result).resolves.toBe(3);
    await expect(workflow.run({ steps: 2 }).result).resolves.toBe(2);
    expect(() => workflow.run({ steps: 0 })).toThrow(/Invalid input/);
    expect(() => workflow.run({ steps: 9 })).toThrow(/Invalid input/);
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

  it("sets a run title from ctx.setTitle", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow(runtime, {
      id: "named-run",
      run: async (_input, ctx) => {
        await ctx.setTitle("CRISPR delivery");
        await ctx.step("work", async () => "ok");
        return { done: true };
      },
    });

    const handle = workflow.run({});
    await handle.result;

    const named = await store.getRun(handle.workflowRunId);
    expect(named?.title).toBe("CRISPR delivery");
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(events.some((event) => event.type === "workflow_title_set")).toBe(true);
  });

  it("ignores a blank ctx.setTitle", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow(runtime, {
      id: "blank-title",
      run: async (_input, ctx) => {
        await ctx.setTitle("   ");
        return { done: true };
      },
    });

    const handle = workflow.run({});
    await handle.result;

    const named = await store.getRun(handle.workflowRunId);
    expect(named?.title).toBeUndefined();
  });

  it("pins input and output types without Zod", async () => {
    type In = { n: number };
    type Out = { doubled: number };
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = createWorkflow<In, Out>(runtime, {
      id: "double",
      run: async (input) => ({ doubled: input.n * 2 }),
    });

    await expect(workflow.run({ n: 3 }).result).resolves.toEqual({ doubled: 6 });
  });

  it("persists an isolated run as its own workflow run, not nested under the parent", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const helper = createWorkflow(runtime, {
      id: "helper",
      run: async (_input, ctx) => {
        await ctx.step("inner", async () => 1);
        return { ok: true };
      },
    });
    const parent = createWorkflow(runtime, {
      id: "parent",
      run: async (_input, ctx) => {
        await ctx.step("call-helper", async () => helper.run({}, { isolated: true }).result);
        return {};
      },
    });

    const parentHandle = parent.run({});
    await parentHandle.result;

    const runs = await store.listRuns();
    expect(runs.map((run) => run.workflowId).sort()).toEqual(["helper", "parent"]);
    const helperRun = runs.find((run) => run.workflowId === "helper");
    expect(helperRun?.workflowRunId).not.toBe(parentHandle.workflowRunId);

    const parentEvents = await store.listEvents({ workflowRunId: parentHandle.workflowRunId });
    expect(
      parentEvents.some(
        (event) => event.type === "workflow_started" && event.workflowId === "helper",
      ),
    ).toBe(false);
    expect(
      parentEvents.some((event) => event.type === "step_started" && event.name === "inner"),
    ).toBe(false);
  });

  it("recomputes a cached step when { force: true } is set", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    let computeCount = 0;
    const workflow = createWorkflow(runtime, {
      id: "forced",
      run: async (_input, ctx) => {
        await ctx.step(
          "work",
          async () => {
            computeCount += 1;
            return computeCount;
          },
          { force: true },
        );
        return null;
      },
    });

    const first = workflow.run(null);
    await first.result;
    const second = workflow.run(null, { workflowRunId: first.workflowRunId });
    await second.result;
    expect(computeCount).toBe(2);
  });

  it("emits step_failed when a step throws", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const workflow = createWorkflow(runtime, {
      id: "boom",
      run: async (_input, ctx) => {
        await ctx.step("work", async () => {
          throw new Error("step exploded");
        });
      },
    });

    const handle = workflow.run({});
    await expect(handle.result).rejects.toThrow(/step exploded/);
    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(events.some((event) => event.type === "step_failed")).toBe(true);
    expect(events.some((event) => event.type === "workflow_failed")).toBe(true);
  });

  it("fails the run when output does not match the Zod schema", async () => {
    const runtime = createAdlRuntime({ stores: { workflow: inMemoryWorkflowStore() } });
    const workflow = createWorkflow(runtime, {
      id: "bad-output",
      output: z.object({ n: z.number() }),
      run: async () => ({ n: "nope" as unknown as number }),
    });

    await expect(workflow.run({}).result).rejects.toThrow();
  });
});

describe("workflow.cancel", () => {
  it("aborts an in-flight step callback and emits workflow_cancelled", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({ stores: { workflow: store } });
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
    const workflow = createWorkflow(runtime, {
      id: "hang",
      run: async (_input, ctx) => {
        await ctx.step("wait", async ({ ctx: child }) => {
          markStarted();
          await new Promise((_, reject) => {
            child.signal.addEventListener("abort", () => reject(child.signal.reason), {
              once: true,
            });
          });
        });
      },
    });

    const handle = workflow.run({});
    await started;
    handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ name: "AbortError" });

    const events = await store.listEvents({ workflowRunId: handle.workflowRunId });
    expect(events.some((event) => event.type === "workflow_cancelled")).toBe(true);
    expect(events.some((event) => event.type === "step_failed")).toBe(true);
  });

  it("exposes ctx.signal on the run context", async () => {
    const runtime = createAdlRuntime();
    let seen: AbortSignal | undefined;
    const workflow = createWorkflow(runtime, {
      id: "signal",
      run: async (_input, ctx) => {
        seen = ctx.signal;
        expect(ctx.signal.aborted).toBe(false);
        return null;
      },
    });

    await workflow.run({}).result;
    expect(seen).toBeInstanceOf(AbortSignal);
  });
});
