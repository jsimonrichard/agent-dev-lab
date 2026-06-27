import { formatStepLabel } from "@/lib/mock/run-projection";
import type { AgentEpisode, RunViewState, StepNode } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface WorkflowTreePanelProps {
  view: RunViewState;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (episode: AgentEpisode) => void;
}

export function WorkflowTreePanel({
  view,
  selectedStepId,
  selectedEpisodeId,
  onSelectStep,
  onSelectEpisode,
}: WorkflowTreePanelProps) {
  const maxDuration = Math.max(...flattenSteps(view.steps).map((s) => s.durationMs ?? 0), 1);

  const selectedStep = selectedStepId ? findStep(view.steps, selectedStepId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Workflow</h2>
        <p className="text-xs text-muted-foreground">
          Step tree · click a step or agent episode to inspect on the right
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-4">
          {view.steps.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Waiting for run events…
            </p>
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
              />
            ))
          )}
        </div>
      </ScrollArea>

      {selectedStep ? (
        <div className="shrink-0 border-t border-border/40 bg-muted/15 px-4 py-3">
          <p className="mb-1 font-mono text-xs font-semibold">
            {formatStepLabel(selectedStep.name, selectedStep.key)}
          </p>
          {selectedStep.output !== undefined ? (
            <pre className="max-h-28 overflow-auto font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(selectedStep.output, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedStep.status === "running" ? "Step in progress…" : "No output yet"}
            </p>
          )}
        </div>
      ) : null}
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
}: {
  step: StepNode;
  depth: number;
  maxDuration: number;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (episode: AgentEpisode) => void;
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
          "group mb-1 flex w-full max-w-2xl cursor-pointer flex-col gap-1 rounded-lg border px-2 py-1.5 text-left transition-colors",
          isSelected
            ? "border-primary/40 bg-accent/50"
            : "border-border/30 bg-card/50 hover:border-border/50 hover:bg-accent/30",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <StepStatusDot status={step.status} />
          <span className="font-mono font-medium">{label}</span>
          {step.durationMs != null ? (
            <span className="text-muted-foreground">{(step.durationMs / 1000).toFixed(1)}s</span>
          ) : null}
        </div>
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
          {step.agentEpisodes.map((ep) => (
            <button
              key={ep.episodeId}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectStep(step.stepId);
                onSelectEpisode(ep);
              }}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-0.5 text-[10px] transition-colors",
                selectedEpisodeId === ep.episodeId
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Badge variant="outline" className="mr-1 h-4 px-1 text-[9px]">
                {ep.agentId}
              </Badge>
              {ep.episodeId}
            </button>
          ))}
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

function findStep(steps: StepNode[], stepId: string): StepNode | undefined {
  for (const step of steps) {
    if (step.stepId === stepId) return step;
    const nested = findStep(step.children, stepId);
    if (nested) return nested;
  }
  return undefined;
}
