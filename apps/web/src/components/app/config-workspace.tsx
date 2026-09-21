import type { ReactNode } from "react";

import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function ConfigWorkspace({
  title,
  subtitle,
  actions,
  children,
  emptyMessage,
  contentClassName,
}: {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  emptyMessage?: string;
  /** Overrides the default `max-w-3xl` content width. */
  contentClassName?: string;
}) {
  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <InspectorSidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      {emptyMessage ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className={cn("mx-auto w-full space-y-8 p-6 md:p-8", contentClassName ?? "max-w-3xl")}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
