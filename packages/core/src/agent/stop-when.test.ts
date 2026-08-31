import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";

import { createTestRuntime } from "../runtime/create-test";
import { countToolCallParts, hasAssistantText, lastAssistantEndPart } from "./stop-when";

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
    const messages: ModelMessage[] = [
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

describe("hasAssistantText", () => {
  it("detects string content and text parts", () => {
    expect(hasAssistantText([{ role: "assistant", content: "done" }])).toBe(true);
    expect(
      hasAssistantText([
        {
          role: "assistant",
          content: [
            { type: "text", text: "looking up" },
            { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("ignores whitespace-only text and tool-only messages", () => {
    expect(hasAssistantText([{ role: "assistant", content: "   " }])).toBe(false);
    expect(
      hasAssistantText([
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} }],
        },
      ]),
    ).toBe(false);
    expect(
      hasAssistantText([
        {
          role: "assistant",
          content: [{ type: "text", text: "  \n" }],
        },
      ]),
    ).toBe(false);
  });
});

describe("lastAssistantEndPart", () => {
  it("returns the last text or tool-call part in episode order", () => {
    expect(
      lastAssistantEndPart([
        {
          role: "assistant",
          content: [
            { type: "text", text: "looking up" },
            { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
          ],
        },
      ]),
    ).toBe("tool-call");
    expect(
      lastAssistantEndPart([
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
            { type: "text", text: "Here is the answer." },
          ],
        },
      ]),
    ).toBe("text");
    expect(lastAssistantEndPart([{ role: "assistant", content: "done" }])).toBe("text");
    expect(lastAssistantEndPart([{ role: "user", content: "hi" }])).toBe("none");
  });
});

function lookupTool() {
  return tool({
    description: "Look up a topic",
    inputSchema: z.object({ topic: z.string() }),
    execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
  });
}

describe("agent.run stopWhen", () => {
  it("forwards the default so a tool-call step can continue", async () => {
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
      tools: { lookup: lookupTool() },
    });

    const result = await agent.run({
      memoryScope: "idle-tools",
      user: "What is ADL?",
    }).result;

    expect(result.turns).toBe(2);
    expect(result.text).toContain("workflow framework");
    expect(call).toBe(2);
  });

  it("forwards stopWhen from the agent definition to streamText", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            return toolCallStream("lookup", JSON.stringify({ topic: "adl" }));
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "once",
      systemPrompt: "Use tools when helpful.",
      stopWhen: stepCountIs(1),
      tools: { lookup: lookupTool() },
    });

    const result = await agent.run({ memoryScope: "single", user: "Go" }).result;

    expect(result.turns).toBe(1);
    expect(call).toBe(1);
  });

  it("lets a per-call stopWhen override the agent definition", async () => {
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
      id: "overridden",
      systemPrompt: "Use tools when helpful.",
      stopWhen: stepCountIs(1),
      tools: { lookup: lookupTool() },
    });

    const result = await agent.run({
      memoryScope: "idle-override",
      user: "What is ADL?",
      stopWhen: stepCountIs(20),
    }).result;

    expect(result.turns).toBe(2);
    expect(call).toBe(2);
  });
});
