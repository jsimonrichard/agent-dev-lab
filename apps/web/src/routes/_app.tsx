import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ResizableAppShell } from "@/components/app/resizable-app-shell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <ResizableAppShell>
      <Outlet />
    </ResizableAppShell>
  );
}
