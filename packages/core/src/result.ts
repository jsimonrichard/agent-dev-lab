/**
 * JSON-serializable success/failure. Safe on inspector payloads and TanStack
 * Start server-function results. Branch with `result.isOk` / `result.isErr`.
 */
export type Ok<T> = {
  value: T;
  isErr: false;
  isOk: true;
};

export type Err<E = string> = {
  error: E;
  isErr: true;
  isOk: false;
};

export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok(value?: unknown): Ok<unknown> | Ok<void> {
  if (arguments.length === 0) {
    return { value: undefined as void, isErr: false, isOk: true };
  }
  return { value, isErr: false, isOk: true };
}

export function err<E>(error: E): Err<E> {
  return { error, isErr: true, isOk: false };
}

/** Throw if `result` is `Err`. Prefer branching on `isErr` when the UI should display the error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr) {
    throw new Error("Result is Err, with error: " + JSON.stringify(result.error));
  }
  return result.value;
}

/** Throw if `result` is `Ok`. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.isOk) {
    throw new Error("Result is Ok, with value: " + JSON.stringify(result.value));
  }
  return result.error;
}

/** Catch a synchronous throw and turn it into {@link Err} with a string message. */
export function fromThrowable<T>(fn: () => T): Result<T, string> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
