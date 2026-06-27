import { PanelLeftIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { useInspectorShell } from "@/components/app/inspector-shell-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Collapses the context sidebar (resizable panel on desktop, sheet on mobile). */
export function InspectorSidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const isMobile = useIsMobile();
  const shell = useInspectorShell();

  if (isMobile || !shell) {
    return <SidebarTrigger className={className} {...props} />;
  }

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        props.onClick?.(event);
        shell.toggleContextSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}
