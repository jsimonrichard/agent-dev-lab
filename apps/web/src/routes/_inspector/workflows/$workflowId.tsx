import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import InspectorShell from "#/components/inspector/InspectorShell";
import StartRunDialog from "#/components/inspector/StartRunDialog";
import { getMockWorkflow, mockRuns } from "#/lib/mock/data";

export const Route = createFileRoute("/_inspector/workflows/$workflowId")({
  component: WorkflowDetailPage,
  loader: ({ params }) => {
    const workflow = getMockWorkflow(params.workflowId);
    if (!workflow) throw notFound();
    return { workflow };
  },
});

function WorkflowDetailPage() {
  const { workflow } = Route.useLoaderData();
  const pastRuns = mockRuns.filter((r) => r.workflowId === workflow.id);

  return (
    <InspectorShell
      title={workflow.id}
      actions={
        <Link to="/workflows" className="text-sm font-semibold no-underline">
          ← All workflows
        </Link>
      }
      startWorkflowId={workflow.id}
    >
      <p className="mb-6 max-w-2xl text-[var(--sea-ink-soft)]">{workflow.description}</p>

      <section className="island-shell mb-6 rounded-2xl p-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Run with input</h2>
        <p className="mb-4 text-sm text-[var(--sea-ink-soft)]">
          Zod-driven form later — JSON editor for now (mock).
        </p>
        <StartRunDialog defaultWorkflowId={workflow.id} />
      </section>

      <section className="island-shell rounded-2xl p-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--sea-ink)]">Past runs</h2>
        {pastRuns.length === 0 ? (
          <p className="text-sm text-[var(--sea-ink-soft)]">No runs yet.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {pastRuns.map((run) => (
              <li key={run.runId}>
                <Link
                  to="/runs/$runId"
                  params={{ runId: run.runId }}
                  className="font-mono text-sm no-underline hover:underline"
                >
                  {run.runId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </InspectorShell>
  );
}
