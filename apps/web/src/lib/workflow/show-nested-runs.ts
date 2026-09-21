import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "adl.showNestedWorkflowRuns";

type Listener = () => void;
const listeners = new Set<Listener>();

function readShowNested(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return readShowNested();
}

function getServerSnapshot(): boolean {
  return false;
}

/** Client preference: when true, the run list includes nested (non-root) runs. Default off. */
export function useShowNestedWorkflowRuns(): {
  showNested: boolean;
  setShowNested: (value: boolean) => void;
} {
  const showNested = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setShowNested = useCallback((value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    emit();
  }, []);
  return { showNested, setShowNested };
}

/** One-shot read for loaders that run only on the client after mount. */
export function getShowNestedWorkflowRuns(): boolean {
  return readShowNested();
}

/** Keep preference in sync across tabs. */
export function useShowNestedWorkflowRunsStorageSync(): void {
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        emit();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
