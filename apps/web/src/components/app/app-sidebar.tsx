import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, GitBranch, Plus, Settings2, Workflow } from "lucide-react";
import { mockProject, mockRuns } from "@/lib/mock/data";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import ThemeToggle from "@/components/ThemeToggle";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeRunId = pathname.match(/^\/runs\/([^/]+)/)?.[1];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{mockProject.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {devModeLabel[mockProject.devMode]}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Runs</span>
            <Button variant="ghost" size="icon" className="size-6" title="Start workflow (mock)">
              <Plus className="size-3.5" />
              <span className="sr-only">New run</span>
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mockRuns.map((run) => (
                <SidebarMenuItem key={run.runId}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeRunId === run.runId}
                    tooltip={run.runId}
                  >
                    <Link to="/runs/$runId" params={{ runId: run.runId }}>
                      <GitBranch className="size-4 shrink-0" />
                      <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                        <span className="truncate font-mono text-xs">{run.runId}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {run.workflowId}
                        </span>
                      </div>
                      <RunStatusDot status={run.status} />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Workflows">
              <Link to="/workflows">
                <Workflow className="size-4" />
                <span>Workflows</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Agents">
              <Link to="/agents">
                <Bot className="size-4" />
                <span>Agents</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link to="/settings">
                <Settings2 className="size-4" />
                <span>Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function RunStatusDot({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "running" && "bg-primary animate-pulse",
        status === "completed" && "bg-muted-foreground",
        status === "failed" && "bg-destructive",
        status === "cancelled" && "bg-border",
      )}
      title={status}
    />
  );
}
