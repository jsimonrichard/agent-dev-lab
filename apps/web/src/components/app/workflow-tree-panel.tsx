import { GitBranch, Layers, MessageSquare } from "lucide-react";

import { formatMemoryScopeLabel, formatStepLabel } from "@/lib/mock/run-projection";
import type { AgentEpisode, RunViewState, StepNode } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { ErrorDetails, ErrorIndicator } from "@/components/app/error-details";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WorkflowTreePanelProps {
  view: RunViewState;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  workflowSelected: boolean;
  onSelectWorkflow: () => void;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (stepId: string, episode: AgentEpisode) => void;
}

export function WorkflowTreePanel({
  view,
  selectedStepId,
  selectedEpisodeId,
  workflowSelected,
  onSelectWorkflow,
  onSelectStep,
  onSelectEpisode,
}: WorkflowTreePanelProps) {
  const maxDuration = Math.max(...flattenSteps(view.steps).map((s) => s.durationMs ?? 0), 1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Workflow</h2>
        <p className="text-xs text-muted-foreground">
          Click the workflow, a step, or a conversation to inspect on the right
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-4">
          <button
            type="button"
            onClick={onSelectWorkflow}
            className={cn(
              "mb-2 flex w-full max-w-2xl items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
              workflowSelected
                ? "border-primary/40 bg-accent/50"
                : "border-border/30 bg-card/50 hover:border-border/50 hover:bg-accent/30",
            )}
          >
            <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono font-medium">{view.workflowId}</span>
            <span className="ml-auto capitalize text-muted-foreground">{view.status}</span>
          </button>

          {view.steps.length === 0 ? (
            view.status === "failed" ? (
              <div className="space-y-3 py-4">
                <p className="text-sm font-medium text-destructive">
                  This run failed before any steps started.
                </p>
                <ErrorDetails error={view.error ?? "Workflow run failed."} compact />
              </div>
            ) : view.status === "cancelled" ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Run cancelled before any steps started.
              </p>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Waiting for run events…
              </p>
            )
          ) : (
            view.steps.map((step) => (
              <WaterfallStep
                key={step.stepId}
                step={step}
                depth={0}
                maxDuration={maxDuration}
                selectedStepId={selectedStepId}
                selectedEpisodeId={selectedEpisodeId}
                onSelectStep={onSelectStep}
                onSelectEpisode={onSelectEpisode}
                runId={view.runId}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function WaterfallStep({
  step,
  depth,
  maxDuration,
  selectedStepId,
  selectedEpisodeId,
  onSelectStep,
  onSelectEpisode,
  runId,
}: {
  step: StepNode;
  depth: number;
  maxDuration: number;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (stepId: string, episode: AgentEpisode) => void;
  runId: string;
}) {
  const label = formatStepLabel(step.name, step.key);
  const isSelected = selectedStepId === step.stepId;
  const widthPct = step.durationMs
    ? Math.max(12, Math.round((step.durationMs / maxDuration) * 100))
    : step.status === "running"
      ? 40
      : 20;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <button
        type="button"
        onClick={() => onSelectStep(step.stepId)}
        className={cn(
          "group mb-1 flex w-full max-w-2xl flex-col gap-1 rounded-lg border px-2 py-1.5 text-left transition-colors",
          isSelected
            ? "border-primary/40 bg-accent/50"
            : "border-border/30 bg-card/50 hover:border-border/50 hover:bg-accent/30",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <StepStatusDot status={step.status} />
          <Layers className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono font-medium">{label}</span>
          {step.durationMs != null ? (
            <span className="text-muted-foreground">{(step.durationMs / 1000).toFixed(1)}s</span>
          ) : null}
        </div>
        {step.status === "failed" && step.error ? (
          <ErrorIndicator error={step.error} className="text-[10px]" />
        ) : null}
        <div
          className={cn(
            "h-2 rounded-full transition-all",
            step.status === "running" && "animate-pulse bg-primary/60",
            step.status === "completed" && "bg-primary/35",
            step.status === "failed" && "bg-destructive/50",
          )}
          style={{ width: `${widthPct}%` }}
        />
      </button>

      {step.agentEpisodes.length > 0 ? (
        <div className="mb-2 ml-4 flex flex-wrap gap-1">
          {step.agentEpisodes.map((ep) => {
            const scopeLabel = formatMemoryScopeLabel(ep.memoryScope, runId);
            return (
              <button
                key={ep.episodeId}
                type="button"
                title={scopeLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEpisode(step.stepId, ep);
                }}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-colors",
                  selectedEpisodeId === ep.episodeId
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : ep.status === "failed"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <MessageSquare className="size-3 shrink-0" />
                <span className="truncate font-mono">{scopeLabel}</span>
                <span className="capitalize">{ep.status}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {step.children.map((child) => (
        <WaterfallStep
          key={child.stepId}
          step={child}
          depth={depth + 1}
          maxDuration={maxDuration}
          selectedStepId={selectedStepId}
          selectedEpisodeId={selectedEpisodeId}
          onSelectStep={onSelectStep}
          onSelectEpisode={onSelectEpisode}
          runId={runId}
        />
      ))}
    </div>
  );
}

function StepStatusDot({ status }: { status: StepNode["status"] }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "running" && "bg-primary",
        status === "completed" && "bg-muted-foreground",
        status === "failed" && "bg-destructive",
      )}
    />
  );
}

function flattenSteps(steps: StepNode[]): StepNode[] {
  const out: StepNode[] = [];
  function walk(nodes: StepNode[]) {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  }
  walk(steps);
  return out;
}
