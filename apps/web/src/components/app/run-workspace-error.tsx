import { Link } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { ErrorDetails } from "@/components/app/error-details";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function RunWorkspaceError({ error, workflowId }: { error: unknown; workflowId?: string }) {
  return (
    <div className="flex h-svh min-h-0 w-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <h1 className="text-sm font-semibold">Workflow run</h1>
      </header>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
        <div className="flex w-full max-w-xl flex-col items-stretch gap-4 pt-8">
          <div className="flex items-center gap-2 text-destructive">
            <CircleAlert className="size-5" />
            <h2 className="text-base font-semibold">Run failed to load</h2>
          </div>
          <ErrorDetails error={error} />
          <div className="flex flex-wrap gap-2">
            {workflowId ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/workflows/$workflowId" params={{ workflowId }}>
                  Back to {workflowId}
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/workflows">Browse workflows</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
