import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export const Route = createFileRoute("/_app/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
  const { project } = useRouteContext({ from: "/_app" });

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Project</h1>
      </header>
      <div className="max-w-xl space-y-6 overflow-auto p-6 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Name</p>
          <p className="font-medium">{project.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Root</p>
          <p className="break-all font-mono text-xs">{project.root}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Dev mode</p>
          <Badge variant="secondary">{devModeLabel[project.devMode]}</Badge>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Workflows</p>
          <p className="font-mono text-xs">
            {project.workflowIds.length > 0 ? project.workflowIds.join(", ") : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Agents</p>
          <p className="font-mono text-xs">
            {project.agentIds.length > 0 ? project.agentIds.join(", ") : "—"}
          </p>
        </div>
        <p className="text-muted-foreground">
          Loaded via <code className="text-xs">loadAdlProject</code> and the project{" "}
          <code className="text-xs">adl</code> runtime from{" "}
          <code className="text-xs">src/adl.ts</code>.
        </p>
      </div>
    </div>
  );
}
