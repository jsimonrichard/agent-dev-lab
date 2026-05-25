import type { AgentEpisode, MockConversation } from "#/lib/mock/types";

interface TranscriptPaneProps {
  episode: AgentEpisode | null;
  conversation: MockConversation | undefined;
}

export default function TranscriptPane({ episode, conversation }: TranscriptPaneProps) {
  if (!episode) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-4 text-center text-sm text-[var(--sea-ink-soft)]">
        Select an agent episode to view the conversation transcript.
      </div>
    );
  }

  const messages = conversation?.messages ?? [];
  const liveTail =
    episode.streamingText && episode.status === "running" ? episode.streamingText : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="island-kicker mb-0.5">Transcript</p>
        <p className="font-mono text-xs text-[var(--sea-ink-soft)]">{episode.memoryScope}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`rounded-xl border px-3 py-2 text-sm ${
              msg.role === "assistant"
                ? "border-[rgba(79,184,178,0.3)] bg-[rgba(79,184,178,0.08)]"
                : msg.role === "user"
                  ? "border-[var(--line)] bg-[var(--chip-bg)]"
                  : "border-dashed border-[var(--line)] bg-transparent text-[var(--sea-ink-soft)]"
            }`}
          >
            <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--sea-ink-soft)]">
              {msg.role}
            </p>
            <p className="m-0 whitespace-pre-wrap text-[var(--sea-ink)]">{msg.content}</p>
          </article>
        ))}
        {liveTail ? (
          <article className="rounded-xl border border-[rgba(79,184,178,0.45)] bg-[rgba(79,184,178,0.1)] px-3 py-2 text-sm">
            <p className="mb-1 text-[0.65rem] font-bold uppercase text-[var(--lagoon-deep)]">
              assistant (streaming)
            </p>
            <p className="m-0 whitespace-pre-wrap text-[var(--sea-ink)]">{liveTail}</p>
          </article>
        ) : null}
        {messages.length === 0 && !liveTail ? (
          <p className="text-sm text-[var(--sea-ink-soft)]">
            No messages in mock store for this scope yet.
          </p>
        ) : null}
      </div>
      <p className="border-t border-[var(--line)] px-4 py-2 text-[0.65rem] text-[var(--sea-ink-soft)]">
        Mock MessageStore — SSE <code>text_delta</code> will append here when wired.
      </p>
    </div>
  );
}
