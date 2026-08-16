import { describe, expect, it } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV2 } from "ai/test";

import { createTestRuntime } from "../runtime/create-test";

function mockTextModel() {
  return new MockLanguageModelV2({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "briefing" },
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

describe("AgentImpl streamText prompt", () => {
  it("does not pass system-role messages to the AI SDK messages field", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const adl = createTestRuntime({ defaults: { model: mockTextModel() } });
      const agent = adl.createAgent({
        id: "researcher",
        instructions: "You are a concise research assistant.",
      });

      const result = await agent.run({
        memoryScope: "notes",
        user: "Give a briefing",
      }).result;

      expect(result.text).toContain("briefing");
      expect(result.messages.every((message) => message.role !== "system")).toBe(true);
      expect(warnings.some((warning) => warning.includes("System messages in the prompt"))).toBe(
        false,
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
