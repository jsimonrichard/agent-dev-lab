import { Link, createFileRoute } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { mockAgents } from "@/lib/mock/data";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/agents/")({
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Agents</h1>
      </header>
      <div className="grid flex-1 gap-4 overflow-auto p-6 sm:grid-cols-2">
        {mockAgents.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle className="font-mono text-base">{a.id}</CardTitle>
              <CardDescription>{a.description}</CardDescription>
            </CardHeader>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <Link
                to="/agents/$agentId"
                params={{ agentId: a.id }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open agent run →
              </Link>
              <Link
                to="/runs/$runId"
                params={{ runId: "run_01H9ZL" }}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                View in workflow run
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
