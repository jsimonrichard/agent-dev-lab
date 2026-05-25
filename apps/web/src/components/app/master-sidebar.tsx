import { Link, useRouterState } from "@tanstack/react-router";
import { Bot, GitBranch, MessageSquare, Settings2 } from "lucide-react";
import { mockRuns } from "@/lib/mock/data";
import { getDefaultAgentRun } from "@/lib/mock/agent-conversations";
import { inspectorModeFromPath } from "@/lib/inspector-mode";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const defaultWorkflowRun = mockRuns[0];

export function MasterSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mode = inspectorModeFromPath(pathname);
  const defaultAgentRun = getDefaultAgentRun();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="flex h-svh w-14 shrink-0 flex-col items-center border-r border-border/40 bg-sidebar py-3"
        aria-label="Inspector mode"
      >
        <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Bot className="size-4" />
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2">
          <MasterNavItem
            label="Workflow runs"
            active={mode === "workflows"}
            disabled={!defaultWorkflowRun}
            to={
              defaultWorkflowRun
                ? "/workflows/$workflowId/run/$runId"
                : "/workflows"
            }
            params={
              defaultWorkflowRun
                ? {
                    workflowId: defaultWorkflowRun.workflowId,
                    runId: defaultWorkflowRun.runId,
                  }
                : undefined
            }
            icon={GitBranch}
          />
          <MasterNavItem
            label="Agent conversations"
            active={mode === "agents"}
            disabled={!defaultAgentRun}
            to="/agent/$agentId/run/$runId"
            params={
              defaultAgentRun
                ? { agentId: defaultAgentRun.agentId, runId: defaultAgentRun.runId }
                : undefined
            }
            icon={MessageSquare}
          />
        </nav>

        <div className="mt-auto flex flex-col items-center gap-2">
          <MasterNavItem
            label="Project settings"
            active={mode === "settings"}
            to="/settings"
            icon={Settings2}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex size-10 items-center justify-center">
                <ThemeToggle />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Theme</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function MasterNavItem({
  label,
  active,
  disabled,
  to,
  params,
  icon: Icon,
  className,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  to: string;
  params?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const buttonClass = cn(
    "flex size-10 items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    disabled && "pointer-events-none opacity-40",
    className,
  );

  const inner = disabled ? (
    <span className={buttonClass}>
      <Icon className="size-4" />
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <Link to={to} params={params} className={buttonClass}>
      <Icon className="size-4" />
      <span className="sr-only">{label}</span>
    </Link>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
