import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface SidebarBackFooterProps {
  label?: string;
}

export function SidebarBackFooter({ label = "Back to overview" }: SidebarBackFooterProps) {
  return (
    <SidebarFooter className="border-t border-sidebar-border/50">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={label}>
            <Link to="/">
              <ArrowLeft className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
