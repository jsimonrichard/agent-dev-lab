import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";

import { createTestRuntime } from "../runtime/create-test";
import type { AdlRuntime } from "../runtime/types";
import type { WorkflowStore } from "../observability/workflow-store";

function workflowStore(adl: AdlRuntime): WorkflowStore {
  const store = adl.services.stores.workflow;
  if (!store) {
    throw new Error("test runtime has no workflow store");
  }
  return store;
}

function mockTextModel(text = "ok") {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: text },
        { type: "text-end", id: "text-1" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      ]),
    }),
  });
}

describe("workflow memory scope access", () => {
  it("records scopes a step loads, saves, or copies", async () => {
    const adl = createTestRuntime();
    const workflow = adl.createWorkflow({
      id: "touch-scope",
      run: async (_input, ctx) => {
        await ctx.step("write", async ({ ctx: stepCtx }) => {
          await adl.services.stores.message.save("notes", [{ role: "user", content: "hi" }]);
          await adl.services.stores.message.load("notes");
          expect(stepCtx.accessedMemoryScopes()).toEqual(["notes"]);
        });
        await ctx.step("copy", async ({ ctx: stepCtx }) => {
          await adl.services.stores.message.copy("notes", "notes-copy");
          expect(stepCtx.accessedMemoryScopes()).toEqual(["notes", "notes-copy"]);
        });
        expect(ctx.accessedMemoryScopes()).toEqual([]);
      },
    });

    const handle = workflow.run({});
    await handle.result;

    const steps = await workflowStore(adl).listStepRecords(handle.workflowRunId);
    expect(steps.find((step) => step.name === "write")?.memoryScopes).toEqual(["notes"]);
    expect(steps.find((step) => step.name === "copy")?.memoryScopes).toEqual([
      "notes",
      "notes-copy",
    ]);
    expect(await adl.services.stores.message.load("notes-copy")).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("records the scope an agent run inside a step loads", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("brief") } });
    const agent = adl.createAgent({ id: "researcher", systemPrompt: "Be brief." });
    const workflow = adl.createWorkflow({
      id: "agent-scope",
      run: async (_input, ctx) => {
        await ctx.step("ask", async () => {
          await agent.run({ memoryScope: "ask-scope", user: "hi" }).result;
        });
      },
    });

    const handle = workflow.run({});
    await handle.result;
    const steps = await workflowStore(adl).listStepRecords(handle.workflowRunId);
    expect(steps.find((step) => step.name === "ask")?.memoryScopes).toEqual(["ask-scope"]);
  });

  it("copies a skipped step's run-scoped transcript onto the new attempt", async () => {
    const adl = createTestRuntime();
    const workflow = adl.createWorkflow({
      id: "resume-scope",
      run: async (_input, ctx) => {
        const scope = ctx.memoryScopeWithSuffix("thread");
        await ctx.step("remember", async () => {
          await adl.services.stores.message.save(scope, [{ role: "user", content: "marigold" }]);
          return "saved";
        });
        await ctx.step("reread", async () => {
          await adl.services.stores.message.load(scope);
          return "reread";
        });
        return ctx.step("recall", async () => adl.services.stores.message.load(scope));
      },
    });

    const first = workflow.run({});
    await first.result;
    const recall = (
      await workflowStore(adl).listEvents({ workflowRunId: first.workflowRunId })
    ).find((event) => event.type === "step_finished" && event.name === "recall");
    if (recall?.type !== "step_finished") {
      throw new Error("expected recall to finish");
    }

    const attempt = await workflowStore(adl).seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: recall.stepId,
    });
    const messages = await workflow.run(
      {},
      { workflowRunId: attempt.newRootRunId, retryAttempt: attempt },
    ).result;
    expect(messages).toEqual([{ role: "user", content: "marigold" }]);

    const skipped = (
      await workflowStore(adl).listEvents({ workflowRunId: attempt.newRootRunId })
    ).find((event) => event.type === "step_skipped" && event.name === "remember");
    if (skipped?.type !== "step_skipped") {
      throw new Error("expected remember to be skipped");
    }
    expect(skipped.memoryScopes).toEqual([`${attempt.newRootRunId}:thread`]);
  });

  it("does not copy a transcript onto a step that re-executes", async () => {
    const adl = createTestRuntime();
    const workflow = adl.createWorkflow({
      id: "resume-writer",
      run: async (_input, ctx) => {
        const scope = ctx.memoryScopeWithSuffix("thread");
        return ctx.step("remember", async () => {
          const existing = await adl.services.stores.message.load(scope);
          await adl.services.stores.message.save(scope, [
            ...existing,
            { role: "user", content: "from-this-run" },
          ]);
          return existing.map((message) =>
            typeof message.content === "string" ? message.content : "",
          );
        });
      },
    });

    const first = workflow.run({});
    await first.result;
    const remember = (
      await workflowStore(adl).listEvents({ workflowRunId: first.workflowRunId })
    ).find((event) => event.type === "step_finished" && event.name === "remember");
    if (remember?.type !== "step_finished") {
      throw new Error("expected remember to finish");
    }

    const attempt = await workflowStore(adl).seedRetryAttempt({
      fromWorkflowRunId: first.workflowRunId,
      fromStepId: remember.stepId,
    });
    const existing = await workflow.run(
      {},
      { workflowRunId: attempt.newRootRunId, retryAttempt: attempt },
    ).result;
    expect(existing).toEqual([]);
  });
});
