import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import InspectorShell from "#/components/inspector/InspectorShell";
import TranscriptPane from "#/components/inspector/TranscriptPane";
import { getMockAgent, mockConversations } from "#/lib/mock/data";
import type { MockMessage } from "#/lib/mock/types";

export const Route = createFileRoute("/_inspector/agents/$agentId")({
  component: AgentPlaygroundPage,
  loader: ({ params }) => {
    const agent = getMockAgent(params.agentId);
    if (!agent) throw notFound();
    return { agent };
  },
});

function AgentPlaygroundPage() {
  const { agent } = Route.useLoaderData();
  const memoryScope = `playground:${agent.id}:local`;
  const baseConversation = mockConversations[memoryScope];
  const [draft, setDraft] = useState("");
  const [extraMessages, setExtraMessages] = useState<MockMessage[]>([]);

  const messages = [...(baseConversation?.messages ?? []), ...extraMessages];

  const mockEpisode = {
    episodeId: "playground-ep",
    agentId: agent.id,
    memoryScope,
    status: "completed" as const,
    streamingText: "",
  };

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setExtraMessages((prev) => [
      ...prev,
      { id: `u-${prev.length}`, role: "user", content: text },
      {
        id: `a-${prev.length}`,
        role: "assistant",
        content: `[Mock reply from ${agent.id}] Received: ${text}`,
      },
    ]);
    setDraft("");
  }

  return (
    <InspectorShell
      title={`Agent: ${agent.id}`}
      actions={
        <Link to="/agents" className="text-sm font-semibold no-underline">
          ← All agents
        </Link>
      }
    >
      <p className="mb-4 max-w-2xl text-sm text-[var(--sea-ink-soft)]">{agent.description}</p>
      <p className="mb-4 font-mono text-xs text-[var(--sea-ink-soft)]">
        memoryScope: {memoryScope} (mock — will call agent.run server fn)
      </p>

      <div className="inspector-run-grid max-w-3xl">
        <div className="island-shell inspector-pane min-h-[360px] overflow-hidden rounded-2xl">
          <TranscriptPane
            episode={mockEpisode}
            conversation={{ memoryScope, agentId: agent.id, messages }}
          />
        </div>
      </div>

      <form onSubmit={handleSend} className="mt-4 flex max-w-3xl gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the agent…"
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-xl border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.22)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)]"
        >
          Send (mock)
        </button>
      </form>
    </InspectorShell>
  );
}
