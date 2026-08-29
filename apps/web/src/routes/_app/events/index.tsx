import { createFileRoute } from "@tanstack/react-router";

import { EventLogWorkspace } from "@/components/app/event-log-workspace";
import { fetchEventLog } from "#/lib/inspector/inspector-server";

export const Route = createFileRoute("/_app/events/")({
  loader: async () => {
    const events = await fetchEventLog();
    return { events };
  },
  component: EventLogPage,
});

function EventLogPage() {
  const { events } = Route.useLoaderData();
  return <EventLogWorkspace initialEvents={events} />;
}
