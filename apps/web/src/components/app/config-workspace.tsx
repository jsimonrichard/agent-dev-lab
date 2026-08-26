import type { ReactNode } from "react";

import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function ConfigWorkspace({
  title,
  subtitle,
  actions,
  children,
  emptyMessage,
}: {
  title: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <div className="flex h-svh min-h-0 flex-col">
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
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-3xl space-y-8 p-6 md:p-8">{children}</div>
        </ScrollArea>
      )}
    </div>
  );
}
