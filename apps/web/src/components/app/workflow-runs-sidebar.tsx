import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { GitBranch, Plus } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { ItemActionsMenu } from "@/components/app/item-actions-menu";
import { StartWorkflowButton } from "@/components/app/start-workflow-dialog";
import type { RunStatus } from "@/lib/view-model/types";
import {
  parseWorkflowLocation,
  workflowRunLabel,
  workflowRunSubtitle,
} from "@/lib/workflow/workflow-location";
import { deleteInspectionWorkflowRun, renameInspectionWorkflowRun } from "#/lib/inspector/inspector-server";
import { latestTimestampById, sortByLastUsedThenAlpha } from "@/lib/nav-sort";
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
  const navigate = useNavigate();
  const router = useRouter();
  const { project, runs } = useAppLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workflowId: selectedWorkflowId, runId: activeRunId } = parseWorkflowLocation(pathname);
  const selectedRuns = selectedWorkflowId
    ? runs.filter((run) => run.workflowId === selectedWorkflowId)
    : [];
  const workflowIds = sortByLastUsedThenAlpha(
    project.workflowIds,
    latestTimestampById(
      runs,
      (run) => run.workflowId,
      (run) => run.startedAt,
    ),
  );

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/40">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={selectedWorkflowId ? selectedWorkflowId : "All workflows"}
            >
              <Link
                to={selectedWorkflowId ? "/workflows/$workflowId" : "/workflows"}
                params={selectedWorkflowId ? { workflowId: selectedWorkflowId } : undefined}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GitBranch className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {selectedWorkflowId ?? project.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedWorkflowId ? "Workflow" : devModeLabel[project.devMode]}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {selectedWorkflowId ? (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between">
              <span>Runs</span>
              <StartWorkflowButton
                variant="ghost"
                size="icon"
                className="size-6"
                title="Start workflow"
                workflowId={selectedWorkflowId}
              >
                <Plus className="size-3.5" />
                <span className="sr-only">New run</span>
              </StartWorkflowButton>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {selectedRuns.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    No runs yet. Start this workflow with the + button.
                  </p>
                ) : (
                  selectedRuns.map((run) => (
                    <SidebarMenuItem key={run.runId}>
                      <ItemActionsMenu
                        name={workflowRunLabel(run)}
                        onRename={async (title) => {
                          await renameInspectionWorkflowRun({
                            data: { runId: run.runId, title },
                          });
                          await router.invalidate();
                        }}
                        onDelete={async () => {
                          await deleteInspectionWorkflowRun({ data: run.runId });
                          if (activeRunId === run.runId) {
                            await navigate({
                              to: "/workflows/$workflowId",
                              params: { workflowId: run.workflowId },
                            });
                          }
                          await router.invalidate();
                        }}
                      >
                        <SidebarMenuButton
                          asChild
                          isActive={activeRunId === run.runId}
                          tooltip={run.runId}
                          className="h-auto min-h-10 py-2"
                        >
                          <Link
                            to="/workflows/$workflowId/run/$runId"
                            params={{ workflowId: run.workflowId, runId: run.runId }}
                          >
                            <GitBranch className="size-4 shrink-0" />
                            <div className="grid min-w-0 flex-1 gap-0.5 text-left">
                              <span
                                className={
                                  run.title ? "truncate text-xs" : "truncate font-mono text-xs"
                                }
                              >
                                {workflowRunLabel(run)}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {run.status} · {workflowRunSubtitle(run)}
                              </span>
                            </div>
                            <RunStatusDot status={run.status} />
                          </Link>
                        </SidebarMenuButton>
                      </ItemActionsMenu>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Workflows</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {workflowIds.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    No workflows registered in this project.
                  </p>
                ) : (
                  workflowIds.map((id) => {
                    const workflowRuns = runs.filter((run) => run.workflowId === id);
                    const latest = workflowRuns[0];
                    return (
                      <SidebarMenuItem key={id}>
                        <SidebarMenuButton asChild tooltip={id} className="h-auto min-h-10 py-2">
                          <Link to="/workflows/$workflowId" params={{ workflowId: id }}>
                            <GitBranch className="size-4 shrink-0" />
                            <div className="grid min-w-0 flex-1 text-left">
                              <span className="truncate font-mono text-xs">{id}</span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {workflowRuns.length === 0
                                  ? "No runs yet"
                                  : `${workflowRuns.length} run${
                                      workflowRuns.length === 1 ? "" : "s"
                                    }${latest ? ` · latest ${latest.status}` : ""}`}
                              </span>
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarBackFooter
        label={selectedWorkflowId ? "All workflows" : "Back to overview"}
        to={selectedWorkflowId ? "/workflows" : "/"}
      />
    </ContextSidebar>
  );
}

function RunStatusDot({ status }: { status: RunStatus }) {
  if (status === "completed" || status === "cancelled") return null;
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "running" && "animate-pulse bg-primary",
        status === "failed" && "bg-destructive",
      )}
      title={status}
    />
  );
}
