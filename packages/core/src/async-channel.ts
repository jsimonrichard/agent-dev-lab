/**
 * A small push→pull bridge: a producer calls `push`/`close`/`fail`; a consumer iterates with
 * `for await`. Useful for exposing an event-emitter-based source (a spawned process's
 * `stdout`/`stderr`, a websocket, ...) as an `AsyncIterable` — in particular, the shape the AI
 * SDK's tool `execute` accepts for a tool that streams preliminary results before its final one
 * (see `AgentToolResultEvent`'s doc comment in `./observability/events` for what that produces
 * on the ADL event stream).
 */
export interface AsyncChannel<T> {
  push(value: T): void;
  close(): void;
  fail(error: unknown): void;
  [Symbol.asyncIterator](): AsyncGenerator<T, void, unknown>;
}

export function createAsyncChannel<T>(): AsyncChannel<T> {
  const buffer: T[] = [];
  const waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  let closed = false;
  let failure: unknown;

  const settleWaiters = () => {
    while (waiters.length > 0 && (buffer.length > 0 || closed)) {
      const waiter = waiters.shift();
      if (!waiter) {
        break;
      }
      if (failure !== undefined) {
        waiter.reject(failure);
        continue;
      }
      if (buffer.length > 0) {
        waiter.resolve({ value: buffer.shift() as T, done: false });
        continue;
      }
      waiter.resolve({ value: undefined as T, done: true });
    }
  };

  return {
    push(value: T) {
      if (closed) {
        return;
      }
      buffer.push(value);
      settleWaiters();
    },
    close() {
      closed = true;
      settleWaiters();
    },
    fail(error: unknown) {
      failure = error;
      closed = true;
      settleWaiters();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift() as T;
          continue;
        }
        if (failure !== undefined) {
          throw failure;
        }
        if (closed) {
          return;
        }
        const result = await new Promise<IteratorResult<T>>((resolve, reject) => {
          waiters.push({ resolve, reject });
        });
        if (result.done) {
          return;
        }
        yield result.value;
      }
    },
  };
}
