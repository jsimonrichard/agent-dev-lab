import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";

import { createAdlRuntime } from "../runtime/create";
import { EVENT_SCHEMA_VERSION } from "./events";
import type { RunEvent } from "./events";
import { inMemoryEventLog } from "./in-memory-event-log";

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

const AT = "2026-01-01T00:00:00.000Z";

function workflowStarted(seq: number, workflowRunId = "run-1"): RunEvent {
  return {
    type: "workflow_started",
    workflowRunId,
    workflowId: "demo",
    input: { n: seq },
    runSeq: seq,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

function agentStarted(seq: number): RunEvent {
  return {
    type: "agent_started",
    agentCallId: "call-1",
    agentId: "writer",
    memoryScope: "notes",
    runSeq: seq,
    at: AT,
    eventSchemaVersion: EVENT_SCHEMA_VERSION,
  };
}

describe("InMemoryEventLog", () => {
  it("assigns a global logSeq and lists afterSeq / type / limit", () => {
    const log = inMemoryEventLog();
    log.onEvent(workflowStarted(1));
    log.onEvent(agentStarted(1));
    log.onEvent(workflowStarted(2, "run-2"));

    expect(log.list().map((entry) => entry.logSeq)).toEqual([1, 2, 3]);
    expect(log.list({ afterSeq: 1 }).map((entry) => entry.event.type)).toEqual([
      "agent_started",
      "workflow_started",
    ]);
    expect(log.list({ type: "agent_started" })).toHaveLength(1);
    expect(log.list({ limit: 2 }).map((entry) => entry.logSeq)).toEqual([2, 3]);
  });

  it("evicts oldest events when the ring buffer is full", () => {
    const log = inMemoryEventLog({ maxEvents: 2 });
    log.onEvent(workflowStarted(1, "a"));
    log.onEvent(workflowStarted(2, "b"));
    log.onEvent(workflowStarted(3, "c"));

    const listed = log.list();
    expect(listed).toHaveLength(2);
    expect(listed.map((entry) => entry.event.workflowRunId)).toEqual(["b", "c"]);
    expect(listed.map((entry) => entry.logSeq)).toEqual([2, 3]);
  });

  it("clears recorded events", () => {
    const log = inMemoryEventLog();
    log.onEvent(workflowStarted(1));
    log.clear();
    expect(log.list()).toEqual([]);
  });

  it("waitForAppend resolves when a later event arrives", async () => {
    const log = inMemoryEventLog();
    log.onEvent(workflowStarted(1));

    const pending = log.waitForAppend(1);
    log.onEvent(workflowStarted(2, "run-2"));
    await pending;

    expect(log.list({ afterSeq: 1 })).toHaveLength(1);
  });

  it("waitForAppend resolves immediately when afterSeq is already behind", async () => {
    const log = inMemoryEventLog();
    log.onEvent(workflowStarted(1));
    await log.waitForAppend(0);
    expect(log.list()).toHaveLength(1);
  });

  it("waitForAppend resolves on abort", async () => {
    const log = inMemoryEventLog();
    const controller = new AbortController();
    const pending = log.waitForAppend(0, controller.signal);
    controller.abort();
    await pending;
  });

  it("captures workflow and agent events when registered on both observer lists", async () => {
    const log = inMemoryEventLog();
    const runtime = createAdlRuntime({
      defaults: { model: mockTextModel() },
      observers: {
        workflows: [log],
        agents: [log],
      },
    });
    const agent = runtime.createAgent({
      id: "event-log-writer",
      systemPrompt: "Be brief.",
    });
    const workflow = runtime.createWorkflow({
      id: "event-log-contract",
      run: async (_input, ctx) => {
        await ctx.step("add", async () => 1);
        await agent.run({
          memoryScope: ctx.memoryScopeWithSuffix("notes"),
          user: "hi",
        }).result;
        return { ok: true };
      },
    });

    await workflow.run({}).result;
    const types = log.list().map((entry) => entry.event.type);
    expect(types).toContain("workflow_started");
    expect(types).toContain("step_finished");
    expect(types).toContain("agent_started");
    expect(types).toContain("agent_finished");
    expect(types).toContain("workflow_finished");
    expect(log.list().every((entry, index) => entry.logSeq === index + 1)).toBe(true);
  });

  it("captures standalone agent.run events", async () => {
    const log = inMemoryEventLog();
    const runtime = createAdlRuntime({
      defaults: { model: mockTextModel() },
      observers: { agents: [log] },
    });
    const agent = runtime.createAgent({
      id: "solo",
      systemPrompt: "Be brief.",
    });

    await agent.run({ memoryScope: "notes", user: "hi" }).result;
    const types = log.list().map((entry) => entry.event.type);
    expect(types).toContain("agent_started");
    expect(types).toContain("agent_finished");
    expect(types.some((type) => type.startsWith("workflow_"))).toBe(false);
  });
});
