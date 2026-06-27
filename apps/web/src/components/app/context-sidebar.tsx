import type { ComponentProps } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarRail } from "@/components/ui/sidebar";

/** Desktop: in-flow sidebar inside a resizable panel. Mobile: icon collapse + sheet. */
export function ContextSidebar({ className, children, ...props }: ComponentProps<typeof Sidebar>) {
  const isMobile = useIsMobile();

  return (
    <Sidebar
      collapsible={isMobile ? "icon" : "none"}
      variant="sidebar"
      className={cn("border-r-0", !isMobile && "h-svh w-full max-w-none", className)}
      {...props}
    >
      {children}
      {isMobile ? <SidebarRail /> : null}
    </Sidebar>
  );
}
