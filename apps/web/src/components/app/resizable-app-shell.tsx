import type { ReactNode } from "react";
import { useCallback } from "react";
import { usePanelRef } from "react-resizable-panels";
import { useRouterState } from "@tanstack/react-router";

import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "@/components/app/app-sidebar";
import { InspectorShellProvider } from "@/components/app/inspector-shell-context";
import { MasterSidebar } from "@/components/app/master-sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { inspectorModeFromPath } from "@/lib/inspector/inspector-mode";

interface ResizableAppShellProps {
  children: ReactNode;
}

export function ResizableAppShell({ children }: ResizableAppShellProps) {
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hideContextSidebar = inspectorModeFromPath(pathname) === "events";

  if (isMobile) {
    return (
      <div className="flex h-svh w-full overflow-hidden">
        <MasterSidebar />
        <SidebarProvider defaultOpen className="min-h-0 min-w-0 flex-1">
          {hideContextSidebar ? null : <AppSidebar />}
          <SidebarInset className="min-h-svh overflow-hidden">{children}</SidebarInset>
        </SidebarProvider>
      </div>
    );
  }

  return <DesktopAppShell hideContextSidebar={hideContextSidebar}>{children}</DesktopAppShell>;
}

function DesktopAppShell({
  children,
  hideContextSidebar,
}: {
  children: ReactNode;
  hideContextSidebar: boolean;
}) {
  const contextPanelRef = usePanelRef();

  const toggleContextSidebar = useCallback(() => {
    const panel = contextPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [contextPanelRef]);

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <MasterSidebar />
      <InspectorShellProvider toggleContextSidebar={toggleContextSidebar}>
        <SidebarProvider
          defaultOpen
          className="flex min-h-0 min-w-0 flex-1 flex-row"
          style={
            {
              "--sidebar-width": "100%",
            } as React.CSSProperties
          }
        >
          {hideContextSidebar ? (
            <SidebarInset className="h-svh min-h-0 overflow-hidden">{children}</SidebarInset>
          ) : (
            <ResizablePanelGroup
              orientation="horizontal"
              id="inspector-context-sidebar"
              className="min-h-0 min-w-0 flex-1"
            >
              <ResizablePanel
                id="context-sidebar"
                panelRef={contextPanelRef}
                collapsible
                defaultSize="20%"
                minSize="14%"
                maxSize="40%"
                className="min-w-0"
              >
                <AppSidebar />
              </ResizablePanel>
              <ResizableHandle className="z-20" />
              <ResizablePanel id="main-content" minSize="50%" defaultSize="80%" className="min-w-0">
                <SidebarInset className="h-svh min-h-0 overflow-hidden">{children}</SidebarInset>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </SidebarProvider>
      </InspectorShellProvider>
    </div>
  );
}
