export type AdlProjectReloadGate = {
  schedule(triggerPath?: string): void;
  dispose(): void;
};

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Debounce and coalesce overlapping {@link LoadedAdlProject.reload} calls so a
 * burst of file events becomes one reload, then one follow-up if more events
 * arrived while that reload was in flight.
 */
export function createAdlProjectReloadGate(options: {
  reload: () => Promise<void>;
  onReload?: (path?: string) => void;
  onError?: (error: Error) => void;
  debounceMs?: number;
}): AdlProjectReloadGate {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let reloadInFlight = false;
  let reloadAgain = false;
  let pendingTriggerPath: string | undefined;
  let disposed = false;

  const runReload = async (triggerPath?: string) => {
    if (disposed) {
      return;
    }
    if (reloadInFlight) {
      reloadAgain = true;
      if (triggerPath) {
        pendingTriggerPath = triggerPath;
      }
      return;
    }

    reloadInFlight = true;
    let pathForReload = triggerPath ?? pendingTriggerPath;
    pendingTriggerPath = undefined;

    try {
      do {
        reloadAgain = false;
        if (disposed) {
          return;
        }
        try {
          await options.reload();
          if (!disposed) {
            options.onReload?.(pathForReload);
          }
        } catch (error) {
          if (!disposed) {
            options.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
        pathForReload = pendingTriggerPath;
        pendingTriggerPath = undefined;
      } while (reloadAgain && !disposed);
    } finally {
      reloadInFlight = false;
    }

    if (reloadAgain && !disposed) {
      void runReload(pendingTriggerPath);
    }
  };

  return {
    schedule(triggerPath?: string) {
      if (disposed) {
        return;
      }
      if (triggerPath) {
        pendingTriggerPath = triggerPath;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void runReload(pendingTriggerPath);
      }, debounceMs);
    },
    dispose() {
      disposed = true;
      clearTimeout(debounceTimer);
    },
  };
}
