import { Bot, GitBranch } from "lucide-react";

import { workflowIdForAgentSession, type AgentSession } from "@/lib/agent/agent-sessions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AgentSessionIdentity({
  session,
  runs,
  className,
}: {
  session: AgentSession;
  runs: ReadonlyArray<{ runId: string; workflowId: string }>;
  className?: string;
}) {
  const workflowId = workflowIdForAgentSession(session, runs);

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Bot className="size-2.5 shrink-0" aria-hidden />
      <span className="sr-only">Agent </span>
      <span className="truncate">{session.agentId}</span>
      {workflowId ? (
        <Badge
          variant="outline"
          className="h-4 max-w-[min(100%,10rem)] gap-0.5 px-1 font-mono text-[9px] font-normal text-muted-foreground"
          title={`Workflow ${workflowId}`}
        >
          <GitBranch className="size-2.5 shrink-0" aria-hidden />
          <span className="sr-only">Workflow </span>
          <span className="truncate">{workflowId}</span>
        </Badge>
      ) : null}
    </span>
  );
}
