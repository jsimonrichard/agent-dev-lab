import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_inspector")({
  component: InspectorLayout,
});

function InspectorLayout() {
  return <Outlet />;
}
