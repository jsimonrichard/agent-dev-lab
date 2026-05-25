import { Link, useRouterState } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";
import { mockProject, mockRuns } from "@/lib/mock/data";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function WorkflowRunsSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeRunId = pathname.match(/^\/runs\/([^/]+)/)?.[1];

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GitBranch className="size-4" />
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
            <span>Workflow runs</span>
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
      <SidebarRail />
    </Sidebar>
  );
}

function RunStatusDot({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "running" && "animate-pulse bg-primary",
        status === "completed" && "bg-muted-foreground",
        status === "failed" && "bg-destructive",
        status === "cancelled" && "bg-border",
      )}
      title={status}
    />
  );
}
