import { useRouterState } from "@tanstack/react-router";
import { inspectorModeFromPath } from "@/lib/inspector-mode";
import { AgentConversationsSidebar } from "@/components/app/agent-conversations-sidebar";
import { WorkflowRunsSidebar } from "@/components/app/workflow-runs-sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { mockProject } from "@/lib/mock/data";
import { Settings2 } from "lucide-react";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mode = inspectorModeFromPath(pathname);

  if (mode === "agents") {
    return <AgentConversationsSidebar />;
  }

  if (mode === "settings") {
    return <SettingsContextSidebar />;
  }

  return <WorkflowRunsSidebar />;
}

function SettingsContextSidebar() {
  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Settings2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{mockProject.name}</span>
                <span className="truncate text-xs text-muted-foreground">Project</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Project settings and registry. Use the rail on the left to switch back to workflow runs or
          agent conversations.
        </p>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
