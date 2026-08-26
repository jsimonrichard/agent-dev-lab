import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface SidebarBackFooterProps {
  label?: string;
  to?: LinkProps["to"];
}

export function SidebarBackFooter({
  label = "Back to overview",
  to = "/",
}: SidebarBackFooterProps) {
  return (
    <SidebarFooter className="border-t border-sidebar-border/40">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={label}>
            <Link to={to}>
              <ArrowLeft className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
