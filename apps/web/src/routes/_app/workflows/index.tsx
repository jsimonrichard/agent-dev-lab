import { Link, createFileRoute } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { mockWorkflows } from "@/lib/mock/data";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Workflows</h1>
      </header>
      <div className="grid flex-1 gap-4 overflow-auto p-6 sm:grid-cols-2">
        {mockWorkflows.map((w) => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle className="font-mono text-base">{w.id}</CardTitle>
              <CardDescription>{w.description}</CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <Link
                to="/runs/$runId"
                params={{ runId: "run_01H9ZK" }}
                className="text-sm font-medium text-primary hover:underline"
              >
                Open sample run →
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
