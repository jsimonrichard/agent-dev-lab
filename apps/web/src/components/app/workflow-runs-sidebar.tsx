import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronRight, GitBranch, Plus } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { useWorkflowRuns } from "@/hooks/use-workflow-runs";
import { parseWorkflowPath } from "@/lib/inspector-path";
import { startInspectionWorkflowRun } from "#/lib/inspector-server";
import { SidebarBackFooter } from "@/components/app/sidebar-back-footer";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { ContextSidebar } from "@/components/app/context-sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

export function WorkflowRunsSidebar() {
  const { project, runs: initialRuns } = useAppLoaderData();
  const { runs, refresh } = useWorkflowRuns(initialRuns);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workflowId: activeWorkflowId, runId: activeRunId } = parseWorkflowPath(pathname);
  const onRegistry = pathname === "/workflows";

  async function handleNewRun(workflowId: string) {
    const { runId } = await startInspectionWorkflowRun({
      data: { workflowId, input: {} },
    });
    await refresh();
    await router.invalidate();
    void router.navigate({
      to: "/workflows/$workflowId/r/$runId",
      params: { workflowId, runId },
    });
  }

  return (
    <ContextSidebar>
      <SidebarHeader className="border-b border-sidebar-border/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild isActive={onRegistry}>
              <Link to="/workflows">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GitBranch className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Workflows</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {project.workflowIds.length} registered
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{project.name}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {project.workflowIds.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No workflows in <code className="text-[10px]">adl.config.ts</code>.
                </p>
              ) : (
                project.workflowIds.map((id) => {
                  const workflowRuns = runs.filter((run) => run.workflowId === id);
                  const isActiveWorkflow = activeWorkflowId === id;
                  const open = isActiveWorkflow || workflowRuns.length > 0;

                  return (
                    <Collapsible key={id} defaultOpen={open} className="group/collapsible">
                      <SidebarMenuItem>
                        <div className="flex items-center gap-0.5">
                          <SidebarMenuButton
                            asChild
                            isActive={isActiveWorkflow && !activeRunId}
                            tooltip={id}
                            className="min-w-0 flex-1"
                          >
                            <Link to="/workflows/$workflowId" params={{ workflowId: id }}>
                              <GitBranch className="size-4 shrink-0" />
                              <span className="truncate font-mono text-xs">{id}</span>
                            </Link>
                          </SidebarMenuButton>
                          <CollapsibleTrigger className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-sidebar-accent">
                            <ChevronRight className="size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                            <span className="sr-only">Toggle runs</span>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <div className="flex items-center justify-between px-2 py-1">
                                <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                                  Runs
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-5"
                                  title={`Start ${id}`}
                                  onClick={() => void handleNewRun(id)}
                                >
                                  <Plus className="size-3" />
                                  <span className="sr-only">Start run</span>
                                </Button>
                              </div>
                            </SidebarMenuSubItem>
                            {workflowRuns.length === 0 ? (
                              <SidebarMenuSubItem>
                                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                  No runs yet.
                                </p>
                              </SidebarMenuSubItem>
                            ) : (
                              workflowRuns.map((run) => (
                                <SidebarMenuSubItem key={run.runId}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={activeRunId === run.runId}
                                    className="h-auto min-h-8 py-1.5"
                                  >
                                    <Link
                                      to="/workflows/$workflowId/r/$runId"
                                      params={{ workflowId: id, runId: run.runId }}
                                    >
                                      <span className="truncate font-mono text-[11px]">
                                        {run.runId}
                                      </span>
                                      <RunStatusDot status={run.status} />
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))
                            )}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })
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
        "ml-auto size-2 shrink-0 rounded-full",
        status === "running" && "animate-pulse bg-primary",
        status === "completed" && "bg-muted-foreground",
        status === "failed" && "bg-destructive",
        status === "cancelled" && "bg-border",
      )}
      title={status}
    />
  );
}
