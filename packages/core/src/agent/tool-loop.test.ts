import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import type { CoreMessage } from "ai";

import { createTestRuntime } from "../runtime/create-test";
import { countToolCallParts, runAgentUntilIdle } from "./tool-loop";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

function textStream(text: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: "stop" as const, usage },
    ]),
  };
}

function toolCallStream(toolName: string, input: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "tool-input-start" as const, id: "call-1", toolName },
      { type: "tool-input-delta" as const, id: "call-1", delta: input },
      { type: "tool-input-end" as const, id: "call-1" },
      {
        type: "tool-call" as const,
        toolCallId: "call-1",
        toolName,
        input,
      },
      { type: "finish" as const, finishReason: "tool-calls" as const, usage },
    ]),
  };
}

describe("countToolCallParts", () => {
  it("counts assistant tool-call parts and ignores other roles", () => {
    const messages: CoreMessage[] = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "looking up" },
          { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: { topic: "adl" } },
          { type: "tool-call", toolCallId: "c2", toolName: "lookup", input: { topic: "agent" } },
        ],
      },
    ];
    expect(countToolCallParts(messages)).toBe(2);
  });

  it("returns 0 for text-only assistant messages", () => {
    expect(countToolCallParts([{ role: "assistant", content: "done" }])).toBe(0);
  });
});

describe("runAgentUntilIdle", () => {
  it("stops after one episode when the model returns text only", async () => {
    const adl = createTestRuntime({
      defaults: { model: new MockLanguageModelV2({ doStream: async () => textStream("hello") }) },
    });
    const agent = adl.createAgent({ id: "plain", systemPrompt: "Be brief." });
    const handles: string[] = [];

    const { result, turns } = await runAgentUntilIdle(
      agent,
      { memoryScope: "idle-text", user: "Hi" },
      { onHandle: (handle) => handles.push(handle.agentCallId) },
    );

    expect(turns).toBe(1);
    expect(result.text).toContain("hello");
    expect(handles).toHaveLength(1);
  });

  it("re-runs after a tool call so the model can answer from the result", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return toolCallStream("lookup", JSON.stringify({ topic: "adl" }));
            }
            return textStream("ADL is a workflow framework.");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "tools",
      systemPrompt: "Use tools when helpful.",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
        }),
      },
    });

    const { result, turns } = await runAgentUntilIdle(agent, {
      memoryScope: "idle-tools",
      user: "What is ADL?",
    });

    expect(turns).toBe(2);
    expect(result.text).toContain("workflow framework");
    expect(countToolCallParts(result.newMessages)).toBe(0);
    expect(call).toBe(2);
  });

  it("stops at maxTurns when every episode still calls tools", async () => {
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => toolCallStream("lookup", JSON.stringify({ topic: "adl" })),
        }),
      },
    });
    const agent = adl.createAgent({
      id: "loop",
      systemPrompt: "Always call the tool.",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "loop" }),
        }),
      },
    });

    const { turns } = await runAgentUntilIdle(
      agent,
      { memoryScope: "idle-cap", user: "Go" },
      { maxTurns: 3 },
    );

    expect(turns).toBe(3);
  });
});
