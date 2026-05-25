import { recordSpanError } from "../runtime/run-recorder";

/** Runs an async side effect without blocking; records failures on the active span. */
export function fireAndForget(promise: Promise<unknown>): void {
  void promise.catch(recordSpanError);
}
