import { Link, createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppLoaderData } from "@/hooks/use-app-loader-data";

export const Route = createFileRoute("/_app/agent/")({
  component: AgentsPage,
});

function AgentsPage() {
  const { project, sessions } = useAppLoaderData();

  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Agents</h1>
      </header>
      <div className="grid flex-1 gap-4 overflow-auto p-6 sm:grid-cols-2">
        {project.agentIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agents registered in <code className="text-xs">adl.config.ts</code>.
          </p>
        ) : (
          project.agentIds.map((id) => {
            const count = sessions.filter((session) => session.agentId === id).length;
            return (
              <Card key={id} className="border-border/40">
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <MessageSquare className="size-4" />
                  </div>
                  <CardTitle className="font-mono text-base">{id}</CardTitle>
                  <CardDescription>Registered agent from the loaded ADL project.</CardDescription>
                </CardHeader>
                <div className="flex flex-col gap-2 px-6 pb-6">
                  <p className="text-xs text-muted-foreground">
                    {count} conversation{count === 1 ? "" : "s"}
                  </p>
                  <Link
                    to="/agent/$agentId"
                    params={{ agentId: id }}
                    className="cursor-pointer text-sm font-medium text-primary hover:underline"
                  >
                    View conversations →
                  </Link>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
