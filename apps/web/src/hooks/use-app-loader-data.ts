import { getRouteApi } from "@tanstack/react-router";

import type { AgentSession } from "#/lib/agent/agent-sessions";
import type { InspectorRunSummary } from "#/lib/view-model/types";
import type { ProjectInspectorMeta } from "#/lib/inspector/inspector-types";

const appRoute = getRouteApi("/_app");

export type AppLoaderData = {
  project: ProjectInspectorMeta;
  runs: InspectorRunSummary[];
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
