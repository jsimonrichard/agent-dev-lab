import { formatStepLabel } from "@/lib/mock/run-projection";
import type { AgentEpisode, StepNode } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface StepTracePanelProps {
  steps: StepNode[];
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (episode: AgentEpisode) => void;
}

export function StepTracePanel({
  steps,
  selectedStepId,
  selectedEpisodeId,
  onSelectStep,
  onSelectEpisode,
}: StepTracePanelProps) {
  return (
    <div className="flex h-full flex-col border-l border-border/40 bg-muted/15">
      <div className="border-b border-border/40 px-4 py-3">
        <h2 className="text-sm font-semibold">Workflow trace</h2>
        <p className="text-xs text-muted-foreground">Steps and agent episodes</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {steps.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Waiting for run events…
            </p>
          ) : (
            steps.map((step) => (
              <StepTraceNode
                key={step.stepId}
                step={step}
                depth={0}
                selectedStepId={selectedStepId}
                selectedEpisodeId={selectedEpisodeId}
                onSelectStep={onSelectStep}
                onSelectEpisode={onSelectEpisode}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function StepTraceNode({
  step,
  depth,
  selectedStepId,
  selectedEpisodeId,
  onSelectStep,
  onSelectEpisode,
}: {
  step: StepNode;
  depth: number;
  selectedStepId: string | null;
  selectedEpisodeId: string | null;
  onSelectStep: (stepId: string) => void;
  onSelectEpisode: (episode: AgentEpisode) => void;
}) {
  const label = formatStepLabel(step.name, step.key);
  const isSelected = selectedStepId === step.stepId;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelectStep(step.stepId)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            step.status === "running" && "bg-primary animate-pulse",
            step.status === "completed" && "bg-muted-foreground",
            step.status === "failed" && "bg-destructive",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono">{label}</span>
        {step.durationMs != null ? (
          <span className="text-[10px] text-muted-foreground">
            {(step.durationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </button>
      {step.agentEpisodes.map((ep) => (
        <button
          key={ep.episodeId}
          type="button"
          onClick={() => {
            onSelectStep(step.stepId);
            onSelectEpisode(ep);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/40",
            selectedEpisodeId === ep.episodeId && "bg-accent/50 text-foreground",
          )}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
        >
          <Badge variant="outline" className="h-4 px-1 text-[9px]">
            {ep.agentId}
          </Badge>
          <span className="truncate">{ep.memoryScope.split(":").pop()}</span>
        </button>
      ))}
      {step.children.map((child) => (
        <StepTraceNode
          key={child.stepId}
          step={child}
          depth={depth + 1}
          selectedStepId={selectedStepId}
          selectedEpisodeId={selectedEpisodeId}
          onSelectStep={onSelectStep}
          onSelectEpisode={onSelectEpisode}
        />
      ))}
    </div>
  );
}
