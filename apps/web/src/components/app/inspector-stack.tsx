import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { usePanelRef } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

const COLLAPSED_SIZE = "32px";

export function InspectorStack({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ResizablePanelGroup
      orientation="vertical"
      id={id}
      className={cn("min-h-0 min-w-0 flex-1", className)}
    >
      {children}
    </ResizablePanelGroup>
  );
}

export function InspectorStackHandle() {
  return <ResizableHandle />;
}

export function InspectorStackSection({
  id,
  title,
  defaultSize,
  minSize = "15%",
  extra,
  children,
}: {
  id: string;
  title: string;
  defaultSize: string;
  minSize?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);

  function toggle() {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }

  return (
    <ResizablePanel
      id={id}
      panelRef={panelRef}
      collapsible
      collapsedSize={COLLAPSED_SIZE}
      defaultSize={defaultSize}
      minSize={minSize}
      className="flex min-h-0 min-w-0 flex-col"
      style={{ overflow: "hidden" }}
      onResize={() => {
        const next = panelRef.current?.isCollapsed() ?? false;
        setCollapsed((prev) => (prev === next ? prev : next));
      }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/40 bg-muted/20 pr-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-1 rounded-sm px-2 py-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                !collapsed && "rotate-90",
              )}
            />
            <span className="truncate text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {title}
            </span>
          </button>
          {extra ? <div className="flex shrink-0 items-center gap-1">{extra}</div> : null}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </ResizablePanel>
  );
}
