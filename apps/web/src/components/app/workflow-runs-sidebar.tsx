import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";

import { startInspectionWorkflowRun } from "#/lib/inspector-server";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
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

export function WorkflowRunsSidebar() {
  const { project, runs } = useRouteContext({ from: "/_app" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeRunId = pathname.match(/^\/workflows\/[^/]+\/run\/([^/]+)/)?.[1];
  const demoWorkflowId = project.workflowIds.includes("demo-counter")
    ? "demo-counter"
    : project.workflowIds[0];

  async function handleNewRun() {
    if (!demoWorkflowId) return;
    const { runId } = await startInspectionWorkflowRun({
      data: { workflowId: demoWorkflowId, input: {} },
    });
    window.location.href = `/workflows/${demoWorkflowId}/run/${runId}`;
  }

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GitBranch className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{project.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {devModeLabel[project.devMode]}
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
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              title="Start workflow"
              disabled={!demoWorkflowId}
              onClick={() => void handleNewRun()}
            >
              <Plus className="size-3.5" />
              <span className="sr-only">New run</span>
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {runs.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No runs yet. Start a workflow from the overview or + button.
                </p>
              ) : (
                runs.map((run) => (
                  <SidebarMenuItem key={run.runId}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeRunId === run.runId}
                      tooltip={`${run.runId} · ${run.workflowId}`}
                      className="h-auto min-h-10 py-2"
                    >
                      <Link
                        to="/workflows/$workflowId/run/$runId"
                        params={{ workflowId: run.workflowId, runId: run.runId }}
                      >
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
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarBackFooter />
    </ContextSidebar>
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
