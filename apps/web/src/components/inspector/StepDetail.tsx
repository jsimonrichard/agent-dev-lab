import type { AgentEpisode, StepNode } from "#/lib/mock/types";
import { formatStepLabel } from "#/lib/mock/run-projection";
import RunStatusBadge from "./RunStatusBadge";

interface StepDetailProps {
  step: StepNode | undefined;
  runStatus: "running" | "completed" | "failed" | "cancelled";
  onSelectEpisode: (episode: AgentEpisode) => void;
  selectedEpisodeId: string | null;
}

export default function StepDetail({
  step,
  runStatus,
  onSelectEpisode,
  selectedEpisodeId,
}: StepDetailProps) {
  if (!step) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center p-6 text-center text-sm text-[var(--sea-ink-soft)]">
        Select a step in the tree to inspect inputs, outputs, and agent episodes.
      </div>
    );
  }

  const label = formatStepLabel(step.name, step.key);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <p className="island-kicker mb-1">Step</p>
        <h2 className="font-mono text-lg font-semibold text-[var(--sea-ink)]">{label}</h2>
        <p className="mt-1 font-mono text-xs text-[var(--sea-ink-soft)]">{step.stepId}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={step.status === "running" ? "running" : "completed"} />
        {step.durationMs != null ? (
          <span className="text-xs text-[var(--sea-ink-soft)]">
            Duration {(step.durationMs / 1000).toFixed(2)}s
          </span>
        ) : null}
      </div>

      {step.path.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--sea-ink)]">Path</p>
          <code className="block text-xs text-[var(--sea-ink-soft)]">{step.path.join(" → ")}</code>
        </div>
      ) : null}

      {step.output !== undefined ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--sea-ink)]">Output</p>
          <pre className="max-h-40 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--chip-bg)] p-3 text-xs">
            {JSON.stringify(step.output, null, 2)}
          </pre>
        </div>
      ) : null}

      {step.agentEpisodes.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--sea-ink)]">Agent episodes</p>
          <ul className="space-y-2">
            {step.agentEpisodes.map((ep) => (
              <li key={ep.episodeId}>
                <button
                  type="button"
                  onClick={() => onSelectEpisode(ep)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selectedEpisodeId === ep.episodeId
                      ? "border-[rgba(79,184,178,0.5)] bg-[rgba(79,184,178,0.14)]"
                      : "border-[var(--line)] bg-[var(--chip-bg)] hover:border-[var(--lagoon-deep)]"
                  }`}
                >
                  <span className="font-semibold text-[var(--sea-ink)]">{ep.agentId}</span>
                  <span className="ml-2 text-xs text-[var(--sea-ink-soft)]">{ep.episodeId}</span>
                  {ep.streamingText ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--sea-ink-soft)]">
                      {ep.streamingText}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {runStatus === "running" && step.status === "running" ? (
        <button
          type="button"
          className="mt-auto w-fit rounded-lg border border-red-300/50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
          title="Mock — cancelRun server fn"
        >
          Cancel run
        </button>
      ) : null}
    </div>
  );
}
