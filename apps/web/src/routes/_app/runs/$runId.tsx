import { createFileRoute, notFound } from "@tanstack/react-router";
import { getMockRun } from "@/lib/mock/data";
import { RunWorkspace } from "@/components/app/run-workspace";

export const Route = createFileRoute("/_app/runs/$runId")({
  component: RunPage,
  loader: ({ params }) => {
    const summary = getMockRun(params.runId);
    if (!summary) throw notFound();
    return { summary };
  },
});

function RunPage() {
  const { summary } = Route.useLoaderData();
  return <RunWorkspace summary={summary} />;
}
