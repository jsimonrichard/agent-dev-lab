import { Link, createFileRoute } from "@tanstack/react-router";
import InspectorShell from "#/components/inspector/InspectorShell";
import RunStatusBadge from "#/components/inspector/RunStatusBadge";
import { mockRuns } from "#/lib/mock/data";

export const Route = createFileRoute("/_inspector/")({
  component: DashboardPage,
});

function DashboardPage() {
  const recent = mockRuns.slice(0, 5);

  return (
    <InspectorShell title="Dashboard">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="island-shell rounded-2xl p-6">
          <p className="island-kicker mb-2">Quick links</p>
          <ul className="m-0 list-none space-y-2 p-0">
            <li>
              <Link to="/workflows" className="font-semibold no-underline hover:underline">
                Workflows
              </Link>
              <span className="text-sm text-[var(--sea-ink-soft)]"> — registry & run</span>
            </li>
            <li>
              <Link to="/agents" className="font-semibold no-underline hover:underline">
                Agents
              </Link>
              <span className="text-sm text-[var(--sea-ink-soft)]"> — playground chat (mock)</span>
            </li>
            <li>
              <Link to="/runs" className="font-semibold no-underline hover:underline">
                Runs
              </Link>
              <span className="text-sm text-[var(--sea-ink-soft)]"> — inspection & waterfall</span>
            </li>
          </ul>
        </section>

        <section className="island-shell rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="island-kicker m-0">Recent runs</p>
            <Link to="/runs" className="text-sm font-semibold no-underline">
              View all
            </Link>
          </div>
          <ul className="m-0 list-none space-y-3 p-0">
            {recent.map((run) => (
              <li key={run.runId}>
                <Link
                  to="/runs/$runId"
                  params={{ runId: run.runId }}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2.5 no-underline hover:border-[var(--lagoon-deep)]"
                >
                  <span className="font-mono text-xs text-[var(--sea-ink)]">{run.runId}</span>
                  <span className="text-sm text-[var(--sea-ink-soft)]">{run.workflowId}</span>
                  <RunStatusBadge status={run.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-6 text-center text-sm text-[var(--sea-ink-soft)]">
        All data is mock — connect to <code>WorkflowStore</code> and SSE when runtime is ready.
      </p>
    </InspectorShell>
  );
}
