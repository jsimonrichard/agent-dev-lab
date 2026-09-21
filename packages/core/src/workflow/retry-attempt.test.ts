import { describe, expect, it } from "bun:test";

import { createAdlRuntime } from "../runtime/create";
import { inMemoryWorkflowStore } from "../observability/in-memory-workflow-store";
import { createWorkflow } from "./create";
import { resolveAttemptChildRunId } from "./retry-attempt";
import type { RetryAttempt } from "./retry-attempt";

describe("retry attempt lineage", () => {
  it("seeds an attempt that skips prefix and re-runs the target", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    let aCount = 0;
    let bCount = 0;
    let cCount = 0;

    const workflow = createWorkflow(runtime, {
      id: "lineage-prefix",
      run: async (_input, ctx) => {
        await ctx.step("a", async () => {
          aCount += 1;
          return "A";
        });
        await ctx.step("b", async () => {
          bCount += 1;
          return "B";
        });
        await ctx.step("c", async () => {
          cCount += 1;
          return "C";
        });
        return { ok: true };
      },
    });

    const first = workflow.run({});
    await first.result;
    expect(aCount).toBe(1);
    expect(bCount).toBe(1);
    expect(cCount).toBe(1);

    const bFinished = await store.getLatestEvent(
      { workflowRunId: first.workflowRunId },
      "step_finished",
    );
    const events = await store.listEvents({ workflowRunId: first.workflowRunId });
    const bStep = events.find((e) => e.type === "step_finished" && e.name === "b");
    expect(bStep?.type).toBe("step_finished");
    if (bStep?.type !== "step_finished") {
      throw new Error("expected b step_finished");
    }

    const attempt = await store.seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: bStep.stepId,
    });

    aCount = 0;
    bCount = 0;
    cCount = 0;
    const second = workflow.run({}, { workflowRunId: attempt.newRootRunId, retryAttempt: attempt });
    await second.result;

    expect(aCount).toBe(0);
    expect(bCount).toBe(1);
    expect(cCount).toBe(1);

    const skipped = await store.listEvents(
      { workflowRunId: attempt.newRootRunId },
      { type: "step_skipped" },
    );
    expect(skipped.some((e) => e.type === "step_skipped" && e.name === "a")).toBe(true);
    expect(bFinished).toBeTruthy();
  });

  it("re-runs pure:false steps even when they started before T_end", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    let impureCount = 0;
    let targetCount = 0;

    const workflow = createWorkflow(runtime, {
      id: "lineage-impure",
      run: async (_input, ctx) => {
        await ctx.step(
          "side-effect",
          async () => {
            impureCount += 1;
            return "impure";
          },
          { pure: false },
        );
        await ctx.step("target", async () => {
          targetCount += 1;
          return "target";
        });
        return { ok: true };
      },
    });

    const first = workflow.run({});
    await first.result;
    expect(impureCount).toBe(1);
    expect(targetCount).toBe(1);

    const events = await store.listEvents({ workflowRunId: first.workflowRunId });
    const target = events.find((e) => e.type === "step_finished" && e.name === "target");
    expect(target?.type).toBe("step_finished");
    if (target?.type !== "step_finished") {
      throw new Error("expected target");
    }

    const attempt = await store.seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: target.stepId,
    });

    impureCount = 0;
    targetCount = 0;
    await workflow.run({}, { workflowRunId: attempt.newRootRunId, retryAttempt: attempt }).result;

    expect(impureCount).toBe(1);
    expect(targetCount).toBe(1);
  });

  it("records parentStepId on nested child runs", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const child = createWorkflow(runtime, {
      id: "child",
      run: async () => ({ nested: true }),
    });
    let spawnStepId: string | null = null;
    let childRunId: string | undefined;
    const parent = createWorkflow(runtime, {
      id: "parent",
      run: async (_input, ctx) =>
        ctx.step("invoke", async ({ ctx: stepCtx }) => {
          spawnStepId = stepCtx.stepId;
          const handle = child.run({});
          childRunId = handle.workflowRunId;
          return handle.result;
        }),
    });

    await parent.run({}).result;
    expect(childRunId).toBeTruthy();
    const childRun = await store.getRun(childRunId!);
    expect(childRun?.parentStepId).toBe(spawnStepId);

    const started = await store.getLatestEvent({ workflowRunId: childRunId! }, "workflow_started");
    expect(started?.type).toBe("workflow_started");
    if (started?.type === "workflow_started") {
      expect(started.parentStepId).toBe(spawnStepId);
    }
  });

  it("throws when fromStepId is unknown", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    const workflow = createWorkflow(runtime, {
      id: "unknown-step",
      run: async (_input, ctx) => {
        await ctx.step("only", async () => 1);
        return null;
      },
    });
    const handle = workflow.run({});
    await handle.result;

    await expect(
      store.seedRetryAttempt({
        fromWorkflowRunId: handle.workflowRunId,
        fromStepId: "does-not-exist",
      }),
    ).rejects.toThrow(/unknown stepId/);
  });

  it("keeps isolated runs out of the cascade (re-call when parent step re-executes)", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });
    let isolatedCount = 0;
    const helper = createWorkflow(runtime, {
      id: "isolated-helper",
      run: async () => {
        isolatedCount += 1;
        return { isolated: true };
      },
    });
    let targetStepId: string | undefined;
    const parent = createWorkflow(runtime, {
      id: "isolated-parent",
      run: async (_input, ctx) => {
        await ctx.step("before", async () => "before");
        const out = await ctx.step("call-isolated", async () => {
          const started = (await store.listEvents({ workflowRunId: ctx.workflowRunId })).find(
            (e) => e.type === "step_started" && e.name === "call-isolated",
          );
          if (started?.type === "step_started") {
            targetStepId = started.stepId;
          }
          return helper.run({}, { isolated: true }).result;
        });
        await ctx.step("after", async () => "after");
        return out;
      },
    });

    const first = parent.run({});
    await first.result;
    expect(isolatedCount).toBe(1);

    const events = await store.listEvents({ workflowRunId: first.workflowRunId });
    const callStep = events.find((e) => e.type === "step_finished" && e.name === "call-isolated");
    expect(callStep?.type).toBe("step_finished");
    if (callStep?.type !== "step_finished") {
      throw new Error("expected call-isolated");
    }

    const isolatedRuns = (await store.listRuns({ workflowId: "isolated-helper" })).filter(
      (r) => r.parentWorkflowRunId == null,
    );
    expect(isolatedRuns).toHaveLength(1);

    const attempt = await store.seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: callStep.stepId,
    });

    // Isolated run is not copied into the new attempt forest
    expect(attempt.runIdMap.has(isolatedRuns[0]!.workflowRunId)).toBe(false);

    isolatedCount = 0;
    await parent.run({}, { workflowRunId: attempt.newRootRunId, retryAttempt: attempt }).result;
    // Parent step re-executed → isolated helper runs fresh
    expect(isolatedCount).toBe(1);
    expect(targetStepId).toBeTruthy();
  });

  it("re-runs failed nested children when the parent spawn re-enters", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });

    let childAttempts = 0;
    let childShouldFail = true;
    const child = createWorkflow(runtime, {
      id: "fail-then-ok-child",
      // Fail before any steps so the child has an empty re-exec set but is still
      // a still-valid-copy candidate when the parent spawn re-enters.
      run: async () => {
        childAttempts += 1;
        if (childShouldFail) {
          throw new Error("child boom");
        }
        return { ok: true };
      },
    });

    const parent = createWorkflow(runtime, {
      id: "fail-child-parent",
      run: async (_input, ctx) => {
        const out = await ctx.step("spawn", async () => child.run({}).result);
        return out;
      },
    });

    const first = parent.run({});
    await expect(first.result).rejects.toThrow(/child boom/);
    expect(childAttempts).toBe(1);

    const events = await store.listEvents({ workflowRunId: first.workflowRunId });
    const spawnStep = events.find((e) => e.type === "step_failed" && e.name === "spawn");
    expect(spawnStep?.type).toBe("step_failed");
    if (spawnStep?.type !== "step_failed") {
      throw new Error("expected spawn step_failed");
    }

    const attempt = await store.seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: spawnStep.stepId,
    });

    const childRuns = await store.listRuns({ workflowId: "fail-then-ok-child" });
    const priorChild = childRuns.find((r) => r.parentWorkflowRunId === first.workflowRunId);
    expect(priorChild).toBeTruthy();
    const seededChildId = attempt.runIdMap.get(priorChild!.workflowRunId)!;
    const seededChild = await store.getRun(seededChildId);
    expect(seededChild?.replayOfRunId ?? null).toBeNull();
    expect(seededChild?.status).toBe("error");

    childAttempts = 0;
    childShouldFail = false;
    await expect(
      parent.run({}, { workflowRunId: attempt.newRootRunId, retryAttempt: attempt }).result,
    ).resolves.toEqual({ ok: true });
    expect(childAttempts).toBe(1);
  });

  it("patches parentStepId on short-circuited nested replay when spawn re-executes", async () => {
    const store = inMemoryWorkflowStore();
    const runtime = createAdlRuntime({
      stores: { workflow: store },
      loadEnv: false,
      version: false,
    });

    let childRuns = 0;
    const child = createWorkflow(runtime, {
      id: "replay-child",
      run: async () => {
        childRuns += 1;
        return { nested: true };
      },
    });

    const parent = createWorkflow(runtime, {
      id: "replay-parent",
      run: async (_input, ctx) =>
        ctx.step("container", async ({ ctx: stepCtx }) => {
          await child.run({}).result;
          await stepCtx.step("target", async () => "target");
          return { ok: true };
        }),
    });

    const first = parent.run({});
    await first.result;
    expect(childRuns).toBe(1);

    const events = await store.listEvents({ workflowRunId: first.workflowRunId });
    const target = events.find((e) => e.type === "step_finished" && e.name === "target");
    expect(target?.type).toBe("step_finished");
    if (target?.type !== "step_finished") {
      throw new Error("expected target");
    }

    const priorChildren = await store.listRuns({ workflowId: "replay-child" });
    expect(priorChildren).toHaveLength(1);
    expect(priorChildren[0]?.parentStepId).toBeTruthy();

    const attempt = await store.seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: target.stepId,
    });

    const seededChildId = attempt.runIdMap.get(priorChildren[0]!.workflowRunId)!;
    const seededBefore = await store.getRun(seededChildId);
    expect(seededBefore?.replayOfRunId).toBe(priorChildren[0]!.workflowRunId);
    expect(seededBefore?.status).toBe("ok");
    expect(seededBefore?.parentStepId ?? null).toBeNull();

    childRuns = 0;
    await parent.run({}, { workflowRunId: attempt.newRootRunId, retryAttempt: attempt }).result;
    expect(childRuns).toBe(0);

    const after = await store.getRun(seededChildId);
    expect(after?.status).toBe("ok");
    expect(after?.replayOfRunId).toBe(priorChildren[0]!.workflowRunId);
    expect(after?.parentStepId).toBeTruthy();

    const container = (await store.listEvents({ workflowRunId: attempt.newRootRunId })).find(
      (e) => e.type === "step_started" && e.name === "container",
    );
    expect(container?.type).toBe("step_started");
    if (container?.type === "step_started") {
      expect(after?.parentStepId).toBe(container.stepId);
    }
  });

  it("maps successive null-parentStepId nested calls FIFO", () => {
    const attempt: RetryAttempt = {
      newRootRunId: "new-root",
      retriesFromRunId: "root",
      runIdMap: new Map([
        ["root", "new-root"],
        ["c1", "nc1"],
        ["c2", "nc2"],
      ]),
      stepIdMap: new Map(),
      reExecStepIds: new Set(),
      priorChildLinks: [
        {
          priorParentRunId: "root",
          priorParentStepId: null,
          priorParentStepPath: [],
          priorChildRunId: "c1",
          workflowId: "leaf",
        },
        {
          priorParentRunId: "root",
          priorParentStepId: null,
          priorParentStepPath: [],
          priorChildRunId: "c2",
          workflowId: "leaf",
        },
      ],
      rootSpawnCursor: new Map(),
    };

    expect(
      resolveAttemptChildRunId(attempt, {
        parentWorkflowRunId: "new-root",
        parentStepId: null,
        workflowId: "leaf",
      }),
    ).toBe("nc1");
    expect(
      resolveAttemptChildRunId(attempt, {
        parentWorkflowRunId: "new-root",
        parentStepId: null,
        workflowId: "leaf",
      }),
    ).toBe("nc2");
    expect(
      resolveAttemptChildRunId(attempt, {
        parentWorkflowRunId: "new-root",
        parentStepId: null,
        workflowId: "leaf",
      }),
    ).toBeUndefined();
  });
});
