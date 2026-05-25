import { Link, useRouteContext } from "@tanstack/react-router";
import { Bot, GitBranch, MessageSquare } from "lucide-react";

import { ContextSidebar } from "@/components/app/context-sidebar";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function HomeSidebar() {
  const { project, runs, sessions } = useRouteContext({ from: "/_app" });
  const defaultWorkflowRun = runs[0];
  const defaultSession = sessions[0];

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {devModeLabel[project.devMode]}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Workflow runs">
                  <Link
                    to={defaultWorkflowRun ? "/workflows/$workflowId/run/$runId" : "/workflows"}
                    params={
                      defaultWorkflowRun
                        ? {
                            workflowId: defaultWorkflowRun.workflowId,
                            runId: defaultWorkflowRun.runId,
                          }
                        : undefined
                    }
                  >
                    <GitBranch className="size-4" />
                    <span>Workflow runs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Agent conversations">
                  <Link
                    to={defaultSession ? "/agent/$agentId/run/$runId" : "/agent"}
                    params={
                      defaultSession
                        ? {
                            agentId: defaultSession.agentId,
                            runId: defaultSession.memoryScope,
                          }
                        : undefined
                    }
                  >
                    <MessageSquare className="size-4" />
                    <span>Agent conversations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </ContextSidebar>
  );
}
