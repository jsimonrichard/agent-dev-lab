import { useCallback, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { fetchWorkflowRuns } from "#/lib/inspector-server";
import type { MockRunSummary } from "#/lib/mock/types";

/**
 * Live workflow run list for sidebars and registry pages.
 *
 * The `_app` route loader only runs on first paint; this hook refetches from the
 * server when navigation changes and while any run is still in progress.
 */
export function useWorkflowRuns(fallback: MockRunSummary[] = []) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [runs, setRuns] = useState<MockRunSummary[]>(fallback);

  const refresh = useCallback(async () => {
    const fresh = await fetchWorkflowRuns();
    setRuns(fresh);
  }, []);

  useEffect(() => {
    setRuns(fallback);
  }, [fallback]);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    if (!runs.some((run) => run.status === "running")) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [runs, refresh]);

  return { runs, refresh };
}
