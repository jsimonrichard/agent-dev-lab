import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { MasterSidebar } from "@/components/app/master-sidebar";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="flex h-svh w-full overflow-hidden">
      <MasterSidebar />
      <SidebarProvider defaultOpen className="min-h-0 min-w-0 flex-1">
        <AppSidebar />
        <SidebarInset className="min-h-svh overflow-hidden">
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
