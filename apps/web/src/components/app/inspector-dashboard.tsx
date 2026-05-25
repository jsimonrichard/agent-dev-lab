import { Link } from "@tanstack/react-router";
import { GitBranch, MessageSquare, Settings2 } from "lucide-react";
import { mockProject, mockRuns, mockWorkflows } from "@/lib/mock/data";
import { getDefaultAgentRun, listAgentConversations } from "@/lib/mock/agent-conversations";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const devModeLabel = {
  "framework-dev": "Framework dev",
  "project-dev": "Project dev",
  serve: "Serve",
} as const;

export function InspectorDashboard() {
  const conversations = listAgentConversations();
  const defaultAgentRun = getDefaultAgentRun();
  const recentRun = mockRuns[0];

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-auto">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold">{mockProject.name}</h1>
          <p className="text-xs text-muted-foreground">{devModeLabel[mockProject.devMode]}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 p-6 md:p-8">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect workflow runs, agent conversations, and project configuration.
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
                <Badge variant="secondary">{mockRuns.length} runs</Badge>
                <Badge variant="outline">{mockWorkflows.length} workflows</Badge>
              </div>
              {recentRun ? (
                <Link
                  to="/workflows/$workflowId/run/$runId"
                  params={{
                    workflowId: recentRun.workflowId,
                    runId: recentRun.runId,
                  }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open latest run →
                </Link>
              ) : null}
              <Link
                to="/workflows"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Browse workflow registry
              </Link>
            </div>
          </Card>

          <Card className="border-border/40">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <MessageSquare className="size-4" />
              </div>
              <CardTitle className="text-base">Agent conversations</CardTitle>
              <CardDescription>
                Standalone agent chats and forks continued outside a workflow.
              </CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-3 px-6 pb-6">
              <Badge variant="secondary">{conversations.length} conversations</Badge>
              {defaultAgentRun ? (
                <Link
                  to="/agent/$agentId/run/$runId"
                  params={{
                    agentId: defaultAgentRun.agentId,
                    runId: defaultAgentRun.runId,
                  }}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open latest conversation →
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
                  {mockProject.configPath}
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
