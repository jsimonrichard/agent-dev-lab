import { describe, expect, it } from "bun:test";

import { conversationMessagesWithoutSystem } from "./chat-messages";

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
