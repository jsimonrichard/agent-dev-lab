/**
 * A value that may already be resolved or may need awaiting.
 * Prefer this over repeating `T | Promise<T>` on public callbacks.
 */
export type MaybePromise<T> = T | Promise<T>;
