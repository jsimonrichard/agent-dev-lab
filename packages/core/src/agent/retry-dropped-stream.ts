import { APICallError, wrapLanguageModel, type LanguageModel } from "ai";

/**
 * A provider body that dies after HTTP 200. `streamText`'s `streamRetries`
 * only reruns a step when the model stream emits `{ type: "error" }`. A socket
 * drop rejects the stream instead (`APICallError`, status 200, `isRetryable`),
 * so that option never sees it.
 */
function isDroppedSuccessfulResponse(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 200 && error.isRetryable === true;
}

type LanguageModelObject = Exclude<LanguageModel, string>;

/**
 * Turns a dropped provider stream into an `{ type: "error" }` part so
 * `streamText`'s own `streamRetries` reruns the step. Chunks pass through
 * unbuffered; every other rejection (aborts, non-200 errors) still rejects.
 */
export function retryableDroppedStream(model: LanguageModelObject): LanguageModelObject {
  return wrapLanguageModel({
    model,
    middleware: {
      wrapStream: async ({ doStream }) => {
        const result = await doStream();
        return { ...result, stream: errorPartOnDrop(result.stream) };
      },
    },
  });
}

function errorPartOnDrop<T>(
  stream: ReadableStream<T>,
): ReadableStream<T | { type: "error"; error: unknown }> {
  const reader = stream.getReader();
  return new ReadableStream({
    async pull(controller) {
      let next: Awaited<ReturnType<typeof reader.read>>;
      try {
        next = await reader.read();
      } catch (error) {
        if (!isDroppedSuccessfulResponse(error)) {
          controller.error(error);
          return;
        }
        controller.enqueue({ type: "error", error });
        controller.close();
        return;
      }
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
