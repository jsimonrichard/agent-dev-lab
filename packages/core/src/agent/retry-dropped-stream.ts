import { APICallError, type LanguageModel } from "ai";

import { throwIfAborted } from "../internal/abort";

type DoStreamOptions = {
  abortSignal?: AbortSignal;
};

type DoStreamResult = {
  stream: ReadableStream;
};

/**
 * A provider body that dies after HTTP 200. `streamText`'s `streamRetries`
 * only reruns a step when the model stream emits `{ type: "error" }`. A socket
 * drop rejects the stream instead (`APICallError`, status 200, `isRetryable`),
 * so that option never sees it.
 */
function isDroppedSuccessfulResponse(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 200 && error.isRetryable === true;
}

/**
 * When `streamRetries` is a positive integer, retry a dropped provider stream
 * inside `doStream` before `streamText` observes it. Each attempt is buffered
 * until it finishes, so a failed attempt's partial text and tool calls are not
 * emitted. The last failure is rethrown as a stream error — the same shape
 * `agent.run` already surfaces.
 */
type LanguageModelObject = Exclude<LanguageModel, string>;

export function retryDroppedProviderStream(
  model: LanguageModelObject,
  streamRetries: number,
): LanguageModelObject {
  return new Proxy(model, {
    get(target, property, receiver) {
      if (property !== "doStream") {
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      const doStream = (
        target as LanguageModelObject & {
          doStream: (options: DoStreamOptions) => PromiseLike<DoStreamResult>;
        }
      ).doStream.bind(target);
      return (options: DoStreamOptions) => streamWithDropRetries(doStream, options, streamRetries);
    },
  });
}

async function streamWithDropRetries(
  doStream: (options: DoStreamOptions) => PromiseLike<DoStreamResult>,
  options: DoStreamOptions,
  streamRetries: number,
): Promise<DoStreamResult> {
  for (let attempt = 0; attempt <= streamRetries; attempt++) {
    if (options.abortSignal) {
      throwIfAborted(options.abortSignal);
    }
    const result = await doStream(options);
    try {
      const chunks = await readToEnd(result.stream);
      return { ...result, stream: chunksToStream(chunks) };
    } catch (error) {
      const retriesLeft = attempt < streamRetries;
      if (
        !retriesLeft ||
        options.abortSignal?.aborted ||
        isAbortError(error) ||
        !isDroppedSuccessfulResponse(error)
      ) {
        return { ...result, stream: erroringStream(error) };
      }
    }
  }
  throw new Error("retryDroppedProviderStream: retries ended without a stream");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function readToEnd(stream: ReadableStream): Promise<unknown[]> {
  const reader = stream.getReader();
  const chunks: unknown[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return chunks;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function chunksToStream(chunks: readonly unknown[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function erroringStream(error: unknown): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.error(error);
    },
  });
}
