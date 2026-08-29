import { describe, expect, it } from "bun:test";
import type { CoreMessage } from "@agent-dev-lab/core";

import {
  collectToolCallIds,
  collectToolResults,
  conversationMessagesWithoutSystem,
  coreMessageToInspector,
  inspectorMessageToCore,
  parseStructuredJson,
  toChatDisplayItems,
} from "./chat-messages";

describe("coreMessageToInspector", () => {
  it("keeps plain text user and assistant messages", () => {
    expect(coreMessageToInspector({ role: "user", content: "hello" }, 0)).toEqual({
      id: "msg-0",
      role: "user",
      content: "hello",
      parts: [{ type: "text", text: "hello" }],
    });
  });

  it("preserves assistant tool-call parts and ignores non-text extras", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Looking that up." },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "searchPapers",
          input: { query: "ALS" },
        },
        { type: "reasoning", text: "hidden" },
      ],
    } as CoreMessage;

    expect(coreMessageToInspector(message, 2)).toEqual({
      id: "msg-2",
      role: "assistant",
      content: "Looking that up.",
      parts: [
        { type: "text", text: "Looking that up." },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "searchPapers",
          args: { query: "ALS" },
        },
      ],
    });
  });

  it("prefers non-empty args when input is an empty object", () => {
    const message = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "search",
          input: {},
          args: { query: "from-args" },
        },
      ],
    } as CoreMessage;

    expect(coreMessageToInspector(message, 0).parts).toEqual([
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "search",
        args: { query: "from-args" },
      },
    ]);
  });

  it("maps tool-role results using output or result fields", () => {
    const message = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "searchPapers",
          output: [{ title: "Paper" }],
        },
      ],
    } as CoreMessage;

    expect(coreMessageToInspector(message, 3).parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "searchPapers",
        result: [{ title: "Paper" }],
        isError: false,
      },
    ]);
  });

  it("treats tool-error parts as failed results", () => {
    const message = {
      role: "assistant",
      content: [
        {
          type: "tool-error",
          toolCallId: "call-9",
          toolName: "boom",
          error: "timeout",
        },
      ],
    } as CoreMessage;

    expect(coreMessageToInspector(message, 0).parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-9",
        toolName: "boom",
        result: "timeout",
        isError: true,
      },
    ]);
  });
});

describe("inspectorMessageToCore", () => {
  it("round-trips a tool call plus result into AI SDK message shapes", () => {
    const assistant = coreMessageToInspector(
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "lookup",
            input: { id: 1 },
          },
        ],
      } as CoreMessage,
      0,
    );
    const tool = coreMessageToInspector(
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "lookup",
            output: { ok: true },
          },
        ],
      } as CoreMessage,
      1,
    );

    expect(inspectorMessageToCore(assistant)).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "lookup",
          input: { id: 1 },
        },
      ],
    });
    expect(inspectorMessageToCore(tool)).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "lookup",
          output: { ok: true },
        },
      ],
    });
  });
});

describe("toChatDisplayItems", () => {
  it("splits mixed assistant turns into text, tool-call, and tool-result messages", () => {
    const messages = [
      coreMessageToInspector({ role: "user", content: "Find papers" }, 0),
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            { type: "text", text: "Looking that up." },
            { type: "tool-call", toolCallId: "c1", toolName: "search", input: { q: "ALS" } },
          ],
        } as CoreMessage,
        1,
      ),
      coreMessageToInspector(
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "c1", toolName: "search", output: "ok" }],
        } as CoreMessage,
        2,
      ),
      coreMessageToInspector({ role: "assistant", content: "Here they are." }, 3),
    ];

    expect(toChatDisplayItems(messages)).toEqual([
      { type: "text", key: "msg-0-text-0", role: "user", text: "Find papers" },
      { type: "text", key: "msg-1-text-0", role: "assistant", text: "Looking that up." },
      {
        type: "tool-call",
        key: "msg-1-call-c1",
        pending: false,
        call: { type: "tool-call", toolCallId: "c1", toolName: "search", args: { q: "ALS" } },
      },
      {
        type: "tool-result",
        key: "msg-2-result-c1",
        result: {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "search",
          result: "ok",
          isError: false,
        },
      },
      { type: "text", key: "msg-3-text-0", role: "assistant", text: "Here they are." },
    ]);
  });

  it("splits text around an inlined tool call into separate messages", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            { type: "text", text: "Before." },
            { type: "tool-call", toolCallId: "c1", toolName: "search", input: {} },
            { type: "text", text: "After." },
          ],
        } as CoreMessage,
        0,
      ),
    ];

    expect(toChatDisplayItems(messages).map((item) => item.type)).toEqual([
      "text",
      "tool-call",
      "text",
    ]);
  });

  it("keeps multiple tool calls in one assistant message as separate rows", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "a", toolName: "one", input: {} },
            { type: "tool-call", toolCallId: "b", toolName: "two", input: { n: 2 } },
          ],
        } as CoreMessage,
        0,
      ),
      coreMessageToInspector(
        {
          role: "tool",
          content: [
            { type: "tool-result", toolCallId: "a", toolName: "one", output: 1 },
            { type: "tool-result", toolCallId: "b", toolName: "two", output: 2 },
          ],
        } as CoreMessage,
        1,
      ),
    ];

    const items = toChatDisplayItems(messages);
    expect(items.map((item) => item.type)).toEqual([
      "tool-call",
      "tool-call",
      "tool-result",
      "tool-result",
    ]);
  });

  it("marks a tool call pending when its result has not arrived", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: "c1", toolName: "search", input: {} }],
        } as CoreMessage,
        0,
      ),
    ];

    const callIds = collectToolCallIds(messages);
    const results = collectToolResults(messages);
    expect(callIds.has("c1")).toBe(true);
    expect(results.has("c1")).toBe(false);
    expect(toChatDisplayItems(messages)).toEqual([
      {
        type: "tool-call",
        key: "msg-0-call-c1",
        pending: true,
        call: { type: "tool-call", toolCallId: "c1", toolName: "search", args: {} },
      },
    ]);
  });

  it("renders a hosted OpenAI web_search action as a pseudo tool-call", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "ws_1",
              toolName: "web_search",
              input: {},
              providerExecuted: true,
            },
            {
              type: "tool-result",
              toolCallId: "ws_1",
              toolName: "web_search",
              output: {
                type: "json",
                value: {
                  action: { type: "search", query: "LLM reasoning recent papers surveys 2023" },
                  sources: [{ type: "url", url: "https://example.com/paper" }],
                },
              },
              providerExecuted: true,
            },
          ],
        } as CoreMessage,
        0,
      ),
    ];

    const items = toChatDisplayItems(messages);
    expect(items).toEqual([
      {
        type: "tool-call",
        key: "msg-0-call-ws_1",
        pending: false,
        call: {
          type: "tool-call",
          toolCallId: "ws_1",
          toolName: "web_search",
          args: { type: "search", query: "LLM reasoning recent papers surveys 2023" },
          providerExecuted: true,
          providerAction: true,
        },
      },
      {
        type: "tool-result",
        key: "msg-0-result-ws_1",
        result: {
          type: "tool-result",
          toolCallId: "ws_1",
          toolName: "web_search",
          result: [{ type: "url", url: "https://example.com/paper" }],
          isError: false,
          providerExecuted: true,
        },
      },
    ]);
  });

  it("unwraps AI SDK result envelopes without dropping payload fields", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: { id: 7 } },
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "lookup",
              output: { type: "json", value: { ok: true, extra: 1 } },
            },
          ],
        } as CoreMessage,
        0,
      ),
    ];

    const items = toChatDisplayItems(messages);
    expect(items.find((item) => item.type === "tool-call")).toMatchObject({
      call: { args: { id: 7 } },
    });
    expect(items.find((item) => item.type === "tool-result")).toMatchObject({
      result: { result: { ok: true, extra: 1 } },
    });
  });

  it("does not treat a local tool result action as a hosted OpenAI action", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolCallId: "c1", toolName: "lookup", input: {} },
            {
              type: "tool-result",
              toolCallId: "c1",
              toolName: "lookup",
              output: { action: { query: "nope" }, ok: true },
            },
          ],
        } as CoreMessage,
        0,
      ),
    ];

    const items = toChatDisplayItems(messages);
    const call = items.find((item) => item.type === "tool-call");
    expect(call).toMatchObject({
      type: "tool-call",
      call: { args: {} },
    });
    expect(call && call.type === "tool-call" ? call.call.providerAction : true).toBeUndefined();
    expect(items.find((item) => item.type === "tool-result")).toMatchObject({
      result: { result: { action: { query: "nope" }, ok: true } },
    });
  });

  it("renders assistant JSON objects as structured json items", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: JSON.stringify({
            title: "CRISPR delivery",
            sections: [{ heading: "Intro", points: ["scope"] }],
          }),
        },
        0,
      ),
    ];

    expect(toChatDisplayItems(messages)).toEqual([
      {
        type: "json",
        key: "msg-0-text-0",
        role: "assistant",
        value: {
          title: "CRISPR delivery",
          sections: [{ heading: "Intro", points: ["scope"] }],
        },
      },
    ]);
  });

  it("renders fenced assistant JSON as a structured json item", () => {
    const messages = [
      coreMessageToInspector(
        {
          role: "assistant",
          content: '```json\n{"score":8,"verdict":"ship"}\n```',
        },
        0,
      ),
    ];

    expect(toChatDisplayItems(messages)).toEqual([
      {
        type: "json",
        key: "msg-0-text-0",
        role: "assistant",
        value: { score: 8, verdict: "ship" },
      },
    ]);
  });

  it("keeps user JSON and invalid assistant JSON as text", () => {
    const messages = [
      coreMessageToInspector({ role: "user", content: '{"q":"hello"}' }, 0),
      coreMessageToInspector({ role: "assistant", content: "{not json" }, 1),
      coreMessageToInspector({ role: "assistant", content: "42" }, 2),
    ];

    expect(toChatDisplayItems(messages).map((item) => item.type)).toEqual(["text", "text", "text"]);
  });
});

describe("parseStructuredJson", () => {
  it("parses objects and arrays, including a wrapping json fence", () => {
    expect(parseStructuredJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseStructuredJson("  [1, 2]  ")).toEqual([1, 2]);
    expect(parseStructuredJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("rejects primitives, empty strings, and invalid JSON", () => {
    expect(parseStructuredJson("")).toBeUndefined();
    expect(parseStructuredJson("hello")).toBeUndefined();
    expect(parseStructuredJson("true")).toBeUndefined();
    expect(parseStructuredJson('"quoted"')).toBeUndefined();
    expect(parseStructuredJson("{")).toBeUndefined();
  });
});

describe("conversationMessagesWithoutSystem", () => {
  it("drops a leading pin and any later system rows", () => {
    const messages = [
      {
        id: "sys",
        role: "system" as const,
        content: "Pinned",
        parts: [{ type: "text" as const, text: "Pinned" }],
      },
      {
        id: "user",
        role: "user" as const,
        content: "Hi",
        parts: [{ type: "text" as const, text: "Hi" }],
      },
      {
        id: "stray",
        role: "system" as const,
        content: "stray",
        parts: [{ type: "text" as const, text: "stray" }],
      },
    ];
    expect(conversationMessagesWithoutSystem(messages).map((message) => message.id)).toEqual([
      "user",
    ]);
  });
});

describe("shouldShowStreamingAssistant", () => {
  it("keeps the stream visible after isRunning until the assistant message is stored", async () => {
    const { shouldShowStreamingAssistant } = await import("./chat-messages");

    expect(
      shouldShowStreamingAssistant(
        [{ id: "pending-1", role: "user", content: "Hi", parts: [{ type: "text", text: "Hi" }] }],
        "Hello there",
        { isRunning: false, sending: false },
      ),
    ).toBe(true);

    expect(
      shouldShowStreamingAssistant(
        [
          { id: "msg-0", role: "user", content: "Hi", parts: [{ type: "text", text: "Hi" }] },
          {
            id: "msg-1",
            role: "assistant",
            content: "Hello there",
            parts: [{ type: "text", text: "Hello there" }],
          },
        ],
        "Hello there",
        { isRunning: false, sending: false },
      ),
    ).toBe(false);
  });
});

describe("mergeConversationMessages", () => {
  it("prefers local optimistic rows over a stale shorter loader snapshot", async () => {
    const { mergeConversationMessages } = await import("./chat-messages");
    const local = [
      {
        id: "pending-1",
        role: "user" as const,
        content: "Hi",
        parts: [{ type: "text" as const, text: "Hi" }],
      },
    ];

    expect(mergeConversationMessages(local, [])).toEqual(local);
  });
});

describe("reconcileFetchedMessages", () => {
  it("preserves pending user ids when content matches", async () => {
    const { reconcileFetchedMessages } = await import("./chat-messages");
    const local = [
      {
        id: "pending-1",
        role: "user" as const,
        content: "Hi",
        parts: [{ type: "text" as const, text: "Hi" }],
      },
    ];
    const fetched = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "Hi",
        parts: [{ type: "text" as const, text: "Hi" }],
      },
      {
        id: "msg-2",
        role: "assistant" as const,
        content: "Hello",
        parts: [{ type: "text" as const, text: "Hello" }],
      },
    ];

    expect(reconcileFetchedMessages(fetched, local)[0]?.id).toBe("pending-1");
  });
});
