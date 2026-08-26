import { useRouterState } from "@tanstack/react-router";
import { inspectorModeFromPath } from "@/lib/inspector-mode";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { AgentConversationsSidebar } from "@/components/app/agent-conversations-sidebar";
import { HomeSidebar } from "@/components/app/home-sidebar";
import { WorkflowRunsSidebar } from "@/components/app/workflow-runs-sidebar";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { ContextSidebar } from "@/components/app/context-sidebar";
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Settings2 } from "lucide-react";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mode = inspectorModeFromPath(pathname);

  if (mode === "home") {
    return <HomeSidebar />;
  }

  if (mode === "agents") {
    return <AgentConversationsSidebar />;
  }

  if (mode === "events") {
    return null;
  }

  if (mode === "settings") {
    return <SettingsContextSidebar />;
  }

  return <WorkflowRunsSidebar />;
}

function SettingsContextSidebar() {
  const { project } = useAppLoaderData();
  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Settings2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{project.name}</span>
                <span className="truncate text-xs text-muted-foreground">Project</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <p className="px-4 py-3 text-xs text-muted-foreground">Project settings and registry.</p>
      </SidebarContent>
      <SidebarBackFooter />
    </ContextSidebar>
  );
}
