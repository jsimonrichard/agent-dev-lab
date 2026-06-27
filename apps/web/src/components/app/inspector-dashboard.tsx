import { Link } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Settings2 } from "lucide-react";

import { useAppLoaderData } from "@/hooks/use-app-loader-data";
import { startInspectionWorkflowRun } from "#/lib/inspector-server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function InspectorDashboard() {
  const { project, runs, sessions } = useAppLoaderData();
  const recentWorkflowId = runs[0]?.workflowId;
  const recentAgentId = sessions[0]?.agentId;
  const demoWorkflowId = project.workflowIds.includes("demo-counter")
    ? "demo-counter"
    : project.workflowIds[0];

  async function handleStartDemo() {
    if (!demoWorkflowId) return;
    const { runId } = await startInspectionWorkflowRun({
      data: { workflowId: demoWorkflowId, input: { steps: 3 } },
    });
    window.location.href = `/workflows/${demoWorkflowId}/r/${runId}`;
  }

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-auto">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold">{project.name}</h1>
          <p className="text-xs text-muted-foreground">{devModeLabel[project.devMode]}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-6 md:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect workflow runs, agent conversations, and project configuration — backed by{" "}
            <code className="text-xs">@agent-dev-lab/core</code>.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/40">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <GitBranch className="size-4" />
              </div>
              <CardTitle className="text-base">Workflows</CardTitle>
              <CardDescription>
                Waterfall traces, step output, and per-step agent transcripts.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{runs.length} runs</Badge>
                <Badge variant="outline">{project.workflowIds.length} workflows</Badge>
              </div>
              <Link to="/workflows" className="text-sm font-medium text-primary hover:underline">
                Browse workflows →
              </Link>
              {demoWorkflowId ? (
                <Button size="sm" variant="secondary" onClick={() => void handleStartDemo()}>
                  Start demo workflow
                </Button>
              ) : null}
              {recentWorkflowId ? (
                <Link
                  to="/workflows/$workflowId"
                  params={{ workflowId: recentWorkflowId }}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  View runs for {recentWorkflowId} →
                </Link>
              ) : null}
            </div>
          </Card>

          <Card className="border-border/40">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <CardTitle className="text-base">Agents</CardTitle>
              <CardDescription>
                Standalone agent chats and forks continued outside a workflow.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-6 pb-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{sessions.length} sessions</Badge>
                <Badge variant="outline">{project.agentIds.length} agents</Badge>
              </div>
              <Link to="/agent" className="text-sm font-medium text-primary hover:underline">
                Browse agents →
              </Link>
              {recentAgentId ? (
                <Link
                  to="/agent/$agentId"
                  params={{ agentId: recentAgentId }}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  View conversations for {recentAgentId} →
                </Link>
              ) : null}
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
            <Link to="/settings" className="text-sm font-medium text-primary hover:underline">
              Project settings →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
