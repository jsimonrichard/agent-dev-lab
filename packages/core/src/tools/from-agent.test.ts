import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { z } from "zod";

import { createTestRuntime } from "../runtime/create-test";

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

const toolCallOptions = {
  toolCallId: "test-tool-call",
  messages: [] as [],
};

describe("createToolFromAgent runtime", () => {
  it("requires an active workflow context", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel() } });
    const agent = adl.createAgent({ id: "plain", instructions: "Be brief." });
    const wrapped = adl.createToolFromAgent(agent, {
      description: "Run the agent",
      mapRun: () => ({ memoryScope: "s", user: "hi" }),
    });

    await expect(wrapped.execute?.({}, toolCallOptions)).rejects.toThrow(/no WorkflowContext/);
  });

  it("runs the agent inside a workflow step and nests on the parent run", async () => {
    const adl = createTestRuntime({ defaults: { model: mockTextModel("briefing") } });
    const agent = adl.createAgent({ id: "plain", instructions: "Be brief." });
    const wrapped = adl.createToolFromAgent(agent, {
      description: "Run the agent",
      mapRun: (_args, { ctx }) => ({
        memoryScope: ctx.memoryScopeWithSuffix("tool"),
        user: "hi",
      }),
    });
    const workflow = adl.createWorkflow({
      id: "host",
      run: async (_input, ctx) =>
        ctx.step("invoke", async () => {
          const output = await wrapped.execute?.({}, toolCallOptions);
          return output;
        }),
    });

    const handle = workflow.run({});
    await expect(handle.result).resolves.toBe("briefing");
    const episodes = await adl.services.stores.workflow?.listAgentEpisodes();
    expect(episodes?.some((episode) => episode.workflowRunId === handle.workflowRunId)).toBe(true);
  });
});

describe("createToolFromWorkflow runtime", () => {
  it("requires an active workflow context", async () => {
    const adl = createTestRuntime();
    const child = adl.createWorkflow({
      id: "child",
      output: z.object({ ok: z.boolean() }),
      run: async () => ({ ok: true }),
    });
    const wrapped = adl.createToolFromWorkflow(child, {
      description: "Run the workflow",
    });

    await expect(wrapped.execute?.({}, toolCallOptions)).rejects.toThrow(/no WorkflowContext/);
  });

  it("nests the child workflow under the caller by default", async () => {
    const adl = createTestRuntime();
    const child = adl.createWorkflow({
      id: "child",
      run: async (_input, ctx) => {
        await ctx.step("inner", async () => 1);
        return { ok: true };
      },
    });
    const wrapped = adl.createToolFromWorkflow(child, {
      description: "Run the workflow",
    });
    const parent = adl.createWorkflow({
      id: "parent",
      run: async (_input, ctx) =>
        ctx.step("invoke", async () => {
          await wrapped.execute?.({}, toolCallOptions);
        }),
    });

    const handle = parent.run({});
    await handle.result;
    const events = await adl.services.stores.workflow?.listEvents({
      workflowRunId: handle.workflowRunId,
    });
    expect(events?.some((event) => event.type === "step_started" && event.name === "inner")).toBe(
      true,
    );
    const runs = await adl.services.stores.workflow?.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs?.[0]?.workflowRunId).toBe(handle.workflowRunId);
  });
});
