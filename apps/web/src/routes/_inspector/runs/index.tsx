import { Link, createFileRoute } from "@tanstack/react-router";
import InspectorShell from "#/components/inspector/InspectorShell";
import RunStatusBadge from "#/components/inspector/RunStatusBadge";
import { mockRuns } from "#/lib/mock/data";

export const Route = createFileRoute("/_inspector/runs/")({
  component: RunsPage,
});

function RunsPage() {
  return (
    <InspectorShell title="Runs">
      <div className="island-shell overflow-hidden rounded-2xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--chip-bg)]">
              <th className="px-4 py-3 font-semibold text-[var(--sea-ink)]">Run ID</th>
              <th className="px-4 py-3 font-semibold text-[var(--sea-ink)]">Workflow</th>
              <th className="px-4 py-3 font-semibold text-[var(--sea-ink)]">Status</th>
              <th className="px-4 py-3 font-semibold text-[var(--sea-ink)]">Started</th>
            </tr>
          </thead>
          <tbody>
            {mockRuns.map((run) => (
              <tr key={run.runId} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    to="/runs/$runId"
                    params={{ runId: run.runId }}
                    className="font-mono text-xs font-semibold no-underline hover:underline"
                  >
                    {run.runId}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--sea-ink-soft)]">
                  {run.workflowId}
                </td>
                <td className="px-4 py-3">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3 text-xs text-[var(--sea-ink-soft)]">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </InspectorShell>
  );
}
