import { Link, createFileRoute } from "@tanstack/react-router";
import InspectorShell from "#/components/inspector/InspectorShell";
import { mockAgents } from "#/lib/mock/data";

export const Route = createFileRoute("/_inspector/agents/")({
  component: AgentsPage,
});

function AgentsPage() {
  return (
    <InspectorShell title="Agents">
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        {mockAgents.map((a) => (
          <li key={a.id}>
            <Link
              to="/agents/$agentId"
              params={{ agentId: a.id }}
              className="island-shell feature-card block rounded-2xl p-5 no-underline"
            >
              <h2 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
                {a.id}
              </h2>
              <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{a.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </InspectorShell>
  );
}
