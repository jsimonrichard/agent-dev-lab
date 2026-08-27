/** Abort reason used when a workflow or agent handle is cancelled. */
export const CANCELLED_MESSAGE = "Workflow run cancelled";

export function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException(CANCELLED_MESSAGE, "AbortError");
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError(signal);
  }
}

/**
 * New controller, aborted when `parent` aborts. `controller.abort()` does not
 * abort the parent — nested runs can fail independently.
 */
export function linkAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) {
    return controller;
  }
  if (parent.aborted) {
    controller.abort(abortError(parent));
    return controller;
  }
  parent.addEventListener("abort", () => controller.abort(abortError(parent)), { once: true });
  return controller;
}

/**
 * Reject when `signal` aborts. The underlying promise may still run; callers that
 * can stop work (e.g. `streamText`) should also receive the same signal.
 */
export function raceAbort<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
