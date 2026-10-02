import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

/** Provider-level (LanguageModelV4) usage shape for mock `finish` stream parts. */
export function mockProviderUsage(
  inputTokens = 1,
  outputTokens = 1,
  extras?: { cacheRead?: number; reasoning?: number },
) {
  const cacheRead = extras?.cacheRead;
  const reasoning = extras?.reasoning;
  return {
    inputTokens: {
      total: inputTokens,
      noCache: inputTokens - (cacheRead ?? 0),
      cacheRead,
      cacheWrite: undefined as number | undefined,
    },
    outputTokens: {
      total: outputTokens,
      text: outputTokens - (reasoning ?? 0),
      reasoning,
    },
  };
}

/** Minimal successful text stream for {@link MockLanguageModelV4}. */
export function mockTextStreamResult(text: string, usage = mockProviderUsage()) {
  return {
    stream: convertArrayToReadableStream([
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: text },
      { type: "text-end", id: "text-1" },
      { type: "finish", finishReason: { unified: "stop" }, usage },
    ]),
  };
}

type LooseMockOptions = {
  provider?: string;
  modelId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock stream unions vary by AI SDK major
  doStream?: (...args: any[]) => any;
};

/**
 * Build a {@link MockLanguageModelV4} without fighting stream-part union inference.
 * Casts at the SDK constructor boundary.
 */
export function mockLanguageModel(options: LooseMockOptions): MockLanguageModelV4 {
  return new MockLanguageModelV4(options as ConstructorParameters<typeof MockLanguageModelV4>[0]);
}

export function mockTextModel(text = "briefing") {
  return mockLanguageModel({
    doStream: async () => mockTextStreamResult(text),
  });
}
