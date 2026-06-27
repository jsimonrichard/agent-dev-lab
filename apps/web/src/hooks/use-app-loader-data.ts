import { getRouteApi } from "@tanstack/react-router";

import type { AgentSession } from "#/lib/agent-sessions";
import type { MockRunSummary } from "#/lib/mock/types";
import type { ProjectInspectorMeta } from "#/lib/run-service";

const appRoute = getRouteApi("/_app");

export type AppLoaderData = {
  project: ProjectInspectorMeta;
  runs: MockRunSummary[];
  sessions: AgentSession[];
};

export function useAppLoaderData(): AppLoaderData {
  const data = appRoute.useLoaderData();
  return {
    project: data.project,
    runs: data.runs ?? [],
    sessions: data.sessions ?? [],
  };
}
