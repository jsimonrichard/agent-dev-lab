import { InspectorSidebarTrigger } from "@/components/app/inspector-sidebar-trigger";

export function EmptySelectionPage({ message }: { message: string }) {
  return (
    <div className="flex h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <InspectorSidebarTrigger className="-ml-1" />
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
