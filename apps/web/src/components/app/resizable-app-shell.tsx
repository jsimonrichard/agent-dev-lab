import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MasterSidebar } from "@/components/app/master-sidebar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface ResizableAppShellProps {
  children: ReactNode;
}

export function ResizableAppShell({ children }: ResizableAppShellProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex h-svh w-full overflow-hidden">
        <MasterSidebar />
        <SidebarProvider defaultOpen className="min-h-0 min-w-0 flex-1">
          <AppSidebar />
          <SidebarInset className="min-h-svh overflow-hidden">{children}</SidebarInset>
        </SidebarProvider>
      </div>
    );
  }

  return (
    <div className="flex h-svh w-full overflow-hidden">
      <MasterSidebar />
      <SidebarProvider
        defaultOpen
        className="flex min-h-0 min-w-0 flex-1 flex-row"
        style={
          {
            "--sidebar-width": "100%",
          } as React.CSSProperties
        }
      >
        <ResizablePanelGroup
          orientation="horizontal"
          id="inspector-context-sidebar"
          className="min-h-0 min-w-0 flex-1"
        >
          <ResizablePanel
            id="context-sidebar"
            defaultSize="20%"
            minSize="14%"
            maxSize="40%"
            className="min-w-0"
          >
            <AppSidebar />
          </ResizablePanel>
          <ResizableHandle withHandle className="z-20 bg-border/50" />
          <ResizablePanel id="main-content" minSize="50%" defaultSize="80%" className="min-w-0">
            <SidebarInset className="h-svh min-h-0 overflow-hidden">{children}</SidebarInset>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarProvider>
    </div>
  );
}
