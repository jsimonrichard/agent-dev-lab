import { describe, expect, it } from "bun:test";
import type { ModelMessage } from "@agent-dev-lab/core";

import { coreMessageToInspector, inspectorMessageToCore } from "./chat-messages";

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
    } as ModelMessage;

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
    } as ModelMessage;

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
    } as ModelMessage;

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
    } as ModelMessage;

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
      } as ModelMessage,
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
      } as ModelMessage,
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
