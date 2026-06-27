import { Link, useRouterState } from "@tanstack/react-router";
import { GitBranch, LayoutDashboard, MessageSquare, Settings2 } from "lucide-react";

import { inspectorModeFromPath } from "@/lib/inspector-mode";
import ThemeToggle from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function MasterSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mode = inspectorModeFromPath(pathname);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="flex h-svh w-14 shrink-0 flex-col items-center border-r border-border/40 bg-sidebar py-3"
        aria-label="Inspector mode"
      >
        <MasterNavItem
          label="Overview"
          active={mode === "home"}
          to="/"
          icon={LayoutDashboard}
          className="mb-2"
        />

        <nav className="flex flex-1 flex-col items-center gap-2">
          <MasterNavItem
            label="Workflows"
            active={mode === "workflows"}
            to="/workflows"
            icon={GitBranch}
          />
          <MasterNavItem
            label="Agents"
            active={mode === "agents"}
            to="/agent"
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
  to,
  params,
  icon: Icon,
  className,
}: {
  label: string;
  active: boolean;
  to: string;
  params?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const buttonClass = cn(
    "flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    className,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={to} params={params} className={buttonClass}>
          <Icon className="size-4" />
          <span className="sr-only">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
