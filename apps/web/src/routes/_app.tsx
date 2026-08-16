import { Outlet, createFileRoute } from "@tanstack/react-router";

import { NotFoundPage } from "@/components/app/not-found";
import { ResizableAppShell } from "@/components/app/resizable-app-shell";
import { fetchAgentSessions, fetchProjectMeta, fetchWorkflowRuns } from "#/lib/inspector-server";

export const Route = createFileRoute("/_app")({
  loader: async () => {
    const [project, runs, sessions] = await Promise.all([
      fetchProjectMeta(),
      fetchWorkflowRuns(),
      fetchAgentSessions(),
    ]);
    return { project, runs, sessions };
  },
  component: AppLayout,
  notFoundComponent: () => (
    <ResizableAppShell>
      <NotFoundPage inAppShell />
    </ResizableAppShell>
  ),
});

function AppLayout() {
  return (
    <ResizableAppShell>
      <Outlet />
    </ResizableAppShell>
  );
}
