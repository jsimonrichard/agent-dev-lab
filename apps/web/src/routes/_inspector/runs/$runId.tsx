import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import InspectorShell from "#/components/inspector/InspectorShell";
import RunStatusBadge from "#/components/inspector/RunStatusBadge";
import StepDetail from "#/components/inspector/StepDetail";
import StepTree from "#/components/inspector/StepTree";
import TranscriptPane from "#/components/inspector/TranscriptPane";
import { getMockRun, getMockRunEvents, mockConversations } from "#/lib/mock/data";
import { buildRunViewState, findStepInTree } from "#/lib/mock/run-projection";
import type { AgentEpisode } from "#/lib/mock/types";

export const Route = createFileRoute("/_inspector/runs/$runId")({
  component: RunDetailPage,
  loader: ({ params }) => {
    const summary = getMockRun(params.runId);
    if (!summary) throw notFound();
    const events = getMockRunEvents(params.runId);
    return { summary, events };
  },
});

type MobilePane = "tree" | "detail" | "transcript";

function RunDetailPage() {
  const { summary, events } = Route.useLoaderData();
  const view = useMemo(() => buildRunViewState(summary.runId, events), [summary.runId, events]);

  const [selectedStepId, setSelectedStepId] = useState<string | null>(() => {
    const first = view.steps[0];
    return first?.stepId ?? null;
  });
  const [selectedEpisode, setSelectedEpisode] = useState<AgentEpisode | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("tree");

  const selectedStep = selectedStepId ? findStepInTree(view.steps, selectedStepId) : undefined;

  const activeEpisode =
    selectedEpisode ?? selectedStep?.agentEpisodes[selectedStep.agentEpisodes.length - 1] ?? null;

  const conversation = activeEpisode ? mockConversations[activeEpisode.memoryScope] : undefined;

  function handleSelectStep(stepId: string) {
    setSelectedStepId(stepId);
    setSelectedEpisode(null);
    setMobilePane("detail");
    const step = findStepInTree(view.steps, stepId);
    const lastEp = step?.agentEpisodes[step.agentEpisodes.length - 1];
    if (lastEp) setSelectedEpisode(lastEp);
  }

  function handleSelectEpisode(ep: AgentEpisode) {
    setSelectedEpisode(ep);
    setMobilePane("transcript");
  }

  const paneTabs: { id: MobilePane; label: string }[] = [
    { id: "tree", label: "Steps" },
    { id: "detail", label: "Detail" },
    { id: "transcript", label: "Transcript" },
  ];

  return (
    <InspectorShell
      actions={
        <Link to="/runs" className="text-sm font-semibold no-underline">
          ← All runs
        </Link>
      }
    >
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="island-kicker mb-1">Run inspection</p>
          <h1 className="display-title m-0 font-mono text-xl font-bold text-[var(--sea-ink)] sm:text-2xl">
            {summary.runId}
          </h1>
          <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
            {view.workflowId} · seq {view.lastSeq}
            {summary.status === "running" ? " · SSE mock (live)" : ""}
          </p>
        </div>
        <RunStatusBadge status={view.status} />
      </header>

      <div className="mb-3 flex gap-1 lg:hidden">
        {paneTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobilePane(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mobilePane === tab.id
                ? "bg-[rgba(79,184,178,0.22)] text-[var(--lagoon-deep)]"
                : "text-[var(--sea-ink-soft)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-run-grid">
        <aside
          className={`island-shell inspector-pane rounded-2xl ${
            mobilePane === "tree" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="border-b border-[var(--line)] px-3 py-2">
            <p className="island-kicker m-0">Step tree</p>
          </div>
          <div className="max-h-[min(70vh,520px)] overflow-auto p-2">
            <StepTree
              steps={view.steps}
              selectedStepId={selectedStepId}
              onSelectStep={handleSelectStep}
            />
          </div>
        </aside>

        <section
          className={`island-shell inspector-pane rounded-2xl ${
            mobilePane === "detail" ? "block" : "hidden lg:block"
          }`}
        >
          <StepDetail
            step={selectedStep}
            runStatus={view.status}
            onSelectEpisode={handleSelectEpisode}
            selectedEpisodeId={activeEpisode?.episodeId ?? null}
          />
        </section>

        <aside
          className={`island-shell inspector-pane overflow-hidden rounded-2xl ${
            mobilePane === "transcript" ? "block" : "hidden lg:block"
          }`}
        >
          <TranscriptPane episode={activeEpisode} conversation={conversation} />
        </aside>
      </div>

      {view.output !== undefined ? (
        <section className="island-shell mt-4 rounded-2xl p-4">
          <p className="mb-2 text-xs font-semibold text-[var(--sea-ink)]">Workflow output</p>
          <pre className="m-0 overflow-auto text-xs">{JSON.stringify(view.output, null, 2)}</pre>
        </section>
      ) : null}
    </InspectorShell>
  );
}
