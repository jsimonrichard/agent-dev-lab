import { Outlet, createFileRoute } from "@tanstack/react-router";

import { NotFoundPage } from "@/components/app/not-found";
import { ProjectReloadErrorBanner } from "@/components/app/project-reload-error-banner";
import { ResizableAppShell } from "@/components/app/resizable-app-shell";
import { useProjectHotReload } from "@/hooks/use-project-hot-reload";
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
  useProjectHotReload();

  return (
    <ResizableAppShell>
      <div className="relative h-full min-h-0">
        <ProjectReloadErrorBanner />
        <Outlet />
      </div>
    </ResizableAppShell>
  );
}
