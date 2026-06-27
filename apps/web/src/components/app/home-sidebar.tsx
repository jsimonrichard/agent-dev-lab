import { Link } from "@tanstack/react-router";
import { Bot, GitBranch, MessageSquare } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function HomeSidebar() {
  const { project } = useAppLoaderData();

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
                <SidebarMenuButton asChild tooltip="Workflow definitions">
                  <Link to="/workflows">
                    <GitBranch className="size-4" />
                    <span>Workflows</span>
                  </Link>
                </SidebarMenuButton>
                {project.workflowIds.length > 0 ? (
                  <SidebarMenuSub>
                    {project.workflowIds.map((id) => (
                      <SidebarMenuSubItem key={id}>
                        <SidebarMenuSubButton asChild>
                          <Link to="/workflows/$workflowId" params={{ workflowId: id }}>
                            <span className="truncate font-mono text-xs">{id}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Agent definitions">
                  <Link to="/agent">
                    <MessageSquare className="size-4" />
                    <span>Agents</span>
                  </Link>
                </SidebarMenuButton>
                {project.agentIds.length > 0 ? (
                  <SidebarMenuSub>
                    {project.agentIds.map((id) => (
                      <SidebarMenuSubItem key={id}>
                        <SidebarMenuSubButton asChild>
                          <Link to="/agent/$agentId" params={{ agentId: id }}>
                            <span className="truncate font-mono text-xs">{id}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </ContextSidebar>
  );
}
