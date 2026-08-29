import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import { GitBranch, LayoutDashboard, MessageSquare, ScrollText, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { inspectorModeFromPath } from "@/lib/inspector/inspector-mode";
import ThemeToggle from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MasterSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mode = inspectorModeFromPath(pathname);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="flex h-svh w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3"
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
            label="Agent conversations"
            active={mode === "agents"}
            to="/agent"
            icon={MessageSquare}
          />
          <MasterNavItem
            label="Event log"
            active={mode === "events"}
            to="/events"
            icon={ScrollText}
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
  to: LinkProps["to"];
  params?: LinkProps["params"];
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const buttonClass = cn(
    "flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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
