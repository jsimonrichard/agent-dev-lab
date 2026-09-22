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
});
