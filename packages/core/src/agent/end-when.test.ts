import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";
import type { CoreMessage } from "ai";

import { createTestRuntime } from "../runtime/create-test";
import {
  countToolCallParts,
  evaluateEndWhen,
  hasAssistantText,
  lastAssistantEndPart,
} from "./end-when";

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

function textAndToolCallStream(text: string, toolName: string, input: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
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

describe("evaluateEndWhen", () => {
  const toolOnly: CoreMessage[] = [
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} }],
    },
  ];
  const textThenTool: CoreMessage[] = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me look that up." },
        { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
      ],
    },
  ];
  const toolThenText: CoreMessage[] = [
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
        { type: "text", text: "Here is the answer." },
      ],
    },
  ];

  it("defaults to ends-with-text", () => {
    expect(evaluateEndWhen(toolOnly)).toBe(false);
    expect(evaluateEndWhen(textThenTool)).toBe(false);
    expect(evaluateEndWhen(toolThenText)).toBe(true);
    expect(evaluateEndWhen([{ role: "assistant", content: "done" }])).toBe(true);
  });

  it("has-text stops as soon as any user-facing text appears", () => {
    expect(evaluateEndWhen(toolOnly, { endWhen: "has-text" })).toBe(false);
    expect(evaluateEndWhen(textThenTool, { endWhen: "has-text" })).toBe(true);
    expect(
      evaluateEndWhen(toolOnly, {
        endWhen: "has-text",
        aggregatedText: "Already explained.",
      }),
    ).toBe(true);
  });

  it("no-tool-calls continues whenever tools were emitted", () => {
    expect(evaluateEndWhen(toolThenText, { endWhen: "no-tool-calls" })).toBe(false);
    expect(
      evaluateEndWhen([{ role: "assistant", content: "done" }], { endWhen: "no-tool-calls" }),
    ).toBe(true);
  });

  it("api-call-ends always stops after the request", () => {
    expect(evaluateEndWhen(toolOnly, { endWhen: "api-call-ends" })).toBe(true);
    expect(evaluateEndWhen(textThenTool, { endWhen: "api-call-ends" })).toBe(true);
  });

  it("predicate returns true to stop", () => {
    const prior: CoreMessage[] = [{ role: "user", content: "hi" }];
    expect(
      evaluateEndWhen(toolOnly, {
        messages: [...prior, ...toolOnly],
        oldMessages: prior,
        endWhen: ({ newMessages }) => lastAssistantEndPart(newMessages) !== "tool-call",
      }),
    ).toBe(false);
    expect(
      evaluateEndWhen(toolThenText, {
        messages: [...prior, ...toolThenText],
        oldMessages: prior,
        endWhen: ({ messages }) => lastAssistantEndPart(messages) === "text",
      }),
    ).toBe(true);
  });

  it("derives oldMessages from messages when omitted", () => {
    const prior: CoreMessage[] = [{ role: "user", content: "hi" }];
    let seen: CoreMessage[] | undefined;
    evaluateEndWhen(toolOnly, {
      messages: [...prior, ...toolOnly],
      endWhen: ({ oldMessages }) => {
        seen = oldMessages;
        return true;
      },
    });
    expect(seen).toEqual(prior);
  });
});

describe("agent.run endWhen", () => {
  it("stops after one request when the model returns text only", async () => {
    const adl = createTestRuntime({
      defaults: { model: new MockLanguageModelV2({ doStream: async () => textStream("hello") }) },
    });
    const agent = adl.createAgent({ id: "plain", systemPrompt: "Be brief." });

    const handle = agent.run({ memoryScope: "idle-text", user: "Hi" });
    const result = await handle.result;

    expect(result.turns).toBe(1);
    expect(result.text).toContain("hello");
  });

  it("continues after a tool call so the model can answer from the result", async () => {
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

    const result = await agent.run({
      memoryScope: "idle-tools",
      user: "What is ADL?",
    }).result;

    expect(result.turns).toBe(2);
    expect(result.text).toContain("workflow framework");
    expect(lastAssistantEndPart(result.newMessages)).toBe("text");
    expect(call).toBe(2);
  });

  it("continues by default when text is followed by a tool call", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return textAndToolCallStream(
                "Let me look that up.",
                "lookup",
                JSON.stringify({ topic: "adl" }),
              );
            }
            return textStream("ADL is a workflow framework.");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "preamble",
      systemPrompt: "Use tools when helpful.",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
        }),
      },
    });

    const result = await agent.run({
      memoryScope: "idle-text-then-tools",
      user: "What is ADL?",
    }).result;

    expect(result.turns).toBe(2);
    expect(result.text).toContain("workflow framework");
    expect(call).toBe(2);
  });

  it("multiplexes textStream across follow-up requests", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return textAndToolCallStream(
                "Let me look that up.",
                "lookup",
                JSON.stringify({ topic: "adl" }),
              );
            }
            return textStream("ADL is a workflow framework.");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "stream-loop",
      systemPrompt: "Use tools when helpful.",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
        }),
      },
    });

    const handle = agent.stream({
      memoryScope: "idle-stream-loop",
      user: "What is ADL?",
    });
    let streamed = "";
    for await (const chunk of handle.textStream) {
      streamed += chunk;
    }
    const result = await handle.finished;
    const events = await adl.services.stores.workflow?.listEvents({
      agentCallId: handle.agentCallId,
    });
    const finished = events?.filter((event) => event.type === "agent_finished") ?? [];

    expect(result.turns).toBe(2);
    expect(streamed).toContain("Let me look that up.");
    expect(streamed).toContain("workflow framework");
    expect(result.text).toContain("workflow framework");
    expect(finished).toHaveLength(1);
    expect(call).toBe(2);
  });

  it("honors endWhen=has-text on the agent definition", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            return textAndToolCallStream(
              "ADL is a workflow framework.",
              "lookup",
              JSON.stringify({ topic: "adl" }),
            );
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "has-text-agent",
      systemPrompt: "Answer, and you may call tools.",
      endWhen: "has-text",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "unused" }),
        }),
      },
    });

    const result = await agent.run({
      memoryScope: "idle-has-text",
      user: "What is ADL?",
    }).result;

    expect(agent.endWhen).toBe("has-text");
    expect(result.turns).toBe(1);
    expect(result.text).toContain("workflow framework");
    expect(countToolCallParts(result.newMessages)).toBe(1);
    expect(call).toBe(1);
  });

  it("lets a per-call endWhen override the agent definition", async () => {
    let call = 0;
    const adl = createTestRuntime({
      defaults: {
        model: new MockLanguageModelV2({
          doStream: async () => {
            call += 1;
            if (call === 1) {
              return textAndToolCallStream(
                "Let me look that up.",
                "lookup",
                JSON.stringify({ topic: "adl" }),
              );
            }
            return textStream("ADL is a workflow framework.");
          },
        }),
      },
    });
    const agent = adl.createAgent({
      id: "overridden",
      systemPrompt: "Use tools when helpful.",
      endWhen: "has-text",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
        }),
      },
    });

    const result = await agent.run({
      memoryScope: "idle-override",
      user: "What is ADL?",
      endWhen: "ends-with-text",
    }).result;

    expect(result.turns).toBe(2);
    expect(call).toBe(2);
  });

  it("makes a single request when endWhen is api-call-ends", async () => {
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
      endWhen: "api-call-ends",
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "loop" }),
        }),
      },
    });

    const handle = agent.run({ memoryScope: "single", user: "Go" });
    const result = await handle.result;
    const events = await adl.services.stores.workflow?.listEvents({
      agentCallId: handle.agentCallId,
    });

    expect(result.turns).toBe(1);
    expect(call).toBe(1);
    expect(events?.some((event) => event.type === "agent_tool_call")).toBe(true);
    expect(events?.some((event) => event.type === "agent_tool_result")).toBe(true);
  });

  it("stops at maxTurns when every request still calls tools", async () => {
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

    const result = await agent.run({
      memoryScope: "idle-cap",
      user: "Go",
      maxTurns: 3,
    }).result;

    expect(result.turns).toBe(3);
  });

  it("stops when an endWhen predicate returns true", async () => {
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
    const seen: Array<{ old: number; next: number }> = [];
    const agent = adl.createAgent({
      id: "predicate",
      systemPrompt: "Use tools when helpful.",
      endWhen: ({ messages, oldMessages, newMessages }) => {
        seen.push({ old: oldMessages.length, next: newMessages.length });
        expect([...oldMessages, ...newMessages]).toEqual(messages);
        return lastAssistantEndPart(messages) === "text";
      },
      tools: {
        lookup: tool({
          description: "Look up a topic",
          inputSchema: z.object({ topic: z.string() }),
          execute: async ({ topic }) => ({ topic, fact: "a workflow framework" }),
        }),
      },
    });

    const result = await agent.run({
      memoryScope: "idle-predicate",
      user: "What is ADL?",
    }).result;

    expect(result.turns).toBe(2);
    expect(result.text).toContain("workflow framework");
    expect(seen).toHaveLength(2);
    expect(seen[0]?.old).toBe(1);
    expect(seen[1]?.old).toBe((seen[0]?.old ?? 0) + (seen[0]?.next ?? 0));
    expect(typeof agent.endWhen).toBe("function");
  });
});
