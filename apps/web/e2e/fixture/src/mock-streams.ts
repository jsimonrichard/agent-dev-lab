import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

import { ECHO_CHUNK_DELAY_MS, ECHO_FIRST_CHUNK, ECHO_SECOND_CHUNK } from "./replies";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Fixture mock model — casts away stream-part union friction across AI SDK majors. */
export function fixtureMockModel(doStream: (...args: never[]) => unknown) {
  return new MockLanguageModelV4({ doStream } as ConstructorParameters<
    typeof MockLanguageModelV4
  >[0]);
}

/** Copied from `packages/core/src/agent/agent-impl.test.ts` — do not import `*.test.ts`. */
export function toolCallStream(toolName: string, input: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "tool-input-start" as const, id: "call-1", toolName },
      { type: "tool-input-delta" as const, id: "call-1", delta: input },
      { type: "tool-input-end" as const, id: "call-1" },
      { type: "tool-call" as const, toolCallId: "call-1", toolName, input },
      { type: "finish" as const, finishReason: { unified: "tool-calls" as const }, usage },
    ]),
  };
}

/** Copied from `packages/core/src/agent/agent-impl.test.ts` — do not import `*.test.ts`. */
export function finalTextStream(text: string) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start" as const, warnings: [] },
      { type: "text-start" as const, id: "text-1" },
      { type: "text-delta" as const, id: "text-1", delta: text },
      { type: "text-end" as const, id: "text-1" },
      { type: "finish" as const, finishReason: { unified: "stop" as const }, usage },
    ]),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Multi-delta assistant text with pauses so Playwright can catch in-flight UI. */
export function delayedEchoStream() {
  const deltas = [ECHO_FIRST_CHUNK, ECHO_SECOND_CHUNK];
  return {
    stream: new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "text-start", id: "text-1" });
        for (const delta of deltas) {
          await wait(ECHO_CHUNK_DELAY_MS);
          controller.enqueue({ type: "text-delta", id: "text-1", delta });
        }
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop" },
          usage,
        });
        controller.close();
      },
    }),
  };
}
