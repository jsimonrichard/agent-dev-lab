import { createFileRoute } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { mockProject } from "@/lib/mock/data";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/settings/")({
  component: SettingsPage,
});

function SettingsPage() {
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
          <p className="font-medium">{mockProject.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Root</p>
          <p className="font-mono text-xs break-all">{mockProject.root}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Dev mode</p>
          <Badge variant="secondary">{mockProject.devMode}</Badge>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Core package</p>
          <p className="font-mono text-xs">@agent-dev-lab/core {mockProject.coreVersion}</p>
        </div>
        <p className="text-muted-foreground">
          Mock project banner — will bind to <code className="text-xs">GET /api/project</code> and
          hot-reload when the user codebase changes.
        </p>
      </div>
    </div>
  );
}
