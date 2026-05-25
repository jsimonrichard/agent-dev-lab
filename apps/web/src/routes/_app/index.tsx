import { createFileRoute } from "@tanstack/react-router";
import { InspectorDashboard } from "@/components/app/inspector-dashboard";

export const Route = createFileRoute("/_app/")({
  component: InspectorDashboard,
});
