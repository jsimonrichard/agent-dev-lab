/**
 * Run an async task at most once; concurrent callers share the same promise.
 * On failure the latch clears so a later caller can retry.
 */
export function createOnceAsync(task: () => Promise<void>): () => Promise<void> {
  let inflight: Promise<void> | null = null;
  return async () => {
    if (!inflight) {
      inflight = task().catch((error: unknown) => {
        inflight = null;
        throw error;
      });
    }
    await inflight;
  };
}
