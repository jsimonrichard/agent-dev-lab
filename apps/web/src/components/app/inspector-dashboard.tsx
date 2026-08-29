import { Link } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Settings2 } from "lucide-react";

import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { RunStatusBadge } from "@/components/app/run-status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { formatRunTimestamp, workflowRunLabel } from "@/lib/workflow/workflow-location";

const RECENT_LIMIT = 6;

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

const recentLinkClassName =
  "block rounded-md px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40";

export function InspectorDashboard() {
  const { project, runs, sessions } = useAppLoaderData();
  const recentRuns = runs.slice(0, RECENT_LIMIT);
  const recentSessions = sessions.slice(0, RECENT_LIMIT);

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-auto">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold">{project.name}</h1>
          <p className="text-xs text-muted-foreground">{devModeLabel[project.devMode]}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6 md:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent workflow runs and agent conversations for this project.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/40">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <GitBranch className="size-4" />
              </div>
              <CardTitle className="text-base">Workflow runs</CardTitle>
              <CardDescription>
                Waterfall traces, step output, and per-step agent transcripts.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {runs.length} run{runs.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {project.workflowIds.length} workflow
                  {project.workflowIds.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {recentRuns.length > 0 ? (
                <ul className="-mx-2">
                  {recentRuns.map((run) => (
                    <li key={run.runId}>
                      <Link
                        to="/workflows/$workflowId/run/$runId"
                        params={{ workflowId: run.workflowId, runId: run.runId }}
                        className={recentLinkClassName}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={
                              run.title
                                ? "truncate text-sm font-medium"
                                : "truncate font-mono text-sm"
                            }
                          >
                            {workflowRunLabel(run)}
                          </p>
                          <RunStatusBadge status={run.status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{run.workflowId}</span>
                          {" · "}
                          {formatRunTimestamp(run.startedAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No runs yet. Open a workflow to start one.
                </p>
              )}
              <Link
                to="/workflows"
                className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Browse workflows
              </Link>
            </div>
          </Card>

          <Card className="border-border/40">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <CardTitle className="text-base">Agent conversations</CardTitle>
              <CardDescription>Recent chats with registered agents.</CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {sessions.length} session{sessions.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {project.agentIds.length} agent{project.agentIds.length === 1 ? "" : "s"}
                </Badge>
              </div>
              {recentSessions.length > 0 ? (
                <ul className="-mx-2">
                  {recentSessions.map((session) => (
                    <li key={session.memoryScope}>
                      <Link
                        to="/agent/$agentId/run/$runId"
                        params={{ agentId: session.agentId, runId: session.memoryScope }}
                        className={recentLinkClassName}
                      >
                        <p className="truncate text-sm font-medium">{session.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{session.agentId}</span>
                          {session.fork ? " · Forked" : ""}
                          {" · "}
                          {formatRunTimestamp(session.updatedAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No conversations yet. Open an agent to start one.
                </p>
              )}
              <Link
                to="/agent"
                className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                Browse agents
              </Link>
            </div>
          </Card>
        </div>

        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Settings2 className="size-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Project</CardTitle>
                <CardDescription className="font-mono text-xs">
                  {project.configPath}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="px-6 pb-6">
            <Link
              to="/settings"
              className="rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Project settings →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
