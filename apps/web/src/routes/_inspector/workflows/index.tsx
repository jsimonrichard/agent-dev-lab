import { Link, createFileRoute } from "@tanstack/react-router";
import InspectorShell from "#/components/inspector/InspectorShell";
import { mockWorkflows } from "#/lib/mock/data";

export const Route = createFileRoute("/_inspector/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <InspectorShell title="Workflows">
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        {mockWorkflows.map((w) => (
          <li key={w.id}>
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId: w.id }}
              className="island-shell feature-card block rounded-2xl p-5 no-underline"
            >
              <h2 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
                {w.id}
              </h2>
              <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{w.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </InspectorShell>
  );
}
