import type { StepNode } from "#/lib/mock/types";
import { formatStepLabel, stepStatusClass } from "#/lib/mock/run-projection";

interface StepTreeProps {
  steps: StepNode[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  depth?: number;
}

function StepTreeNode({
  step,
  selectedStepId,
  onSelectStep,
  depth,
}: {
  step: StepNode;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  depth: number;
}) {
  const isSelected = selectedStepId === step.stepId;
  const label = formatStepLabel(step.name, step.key);
  const hasAgent = step.agentEpisodes.length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectStep(step.stepId)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
          isSelected
            ? "bg-[rgba(79,184,178,0.2)] font-semibold text-[var(--sea-ink)]"
            : "text-[var(--sea-ink-soft)] hover:bg-[var(--link-bg-hover)] hover:text-[var(--sea-ink)]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stepStatusClass(step.status)}`}>
          <span
            className={`block h-full w-full rounded-full ${
              step.status === "running"
                ? "animate-pulse bg-[var(--lagoon)]"
                : step.status === "completed"
                  ? "bg-[var(--palm)]"
                  : "bg-red-500"
            }`}
          />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
        {hasAgent ? (
          <span className="shrink-0 text-[0.65rem] text-[var(--sea-ink-soft)]">agent</span>
        ) : null}
        {step.durationMs != null ? (
          <span className="shrink-0 font-mono text-[0.65rem] text-[var(--sea-ink-soft)]">
            {(step.durationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </button>
      {step.children.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5">
          {step.children.map((child) => (
            <StepTreeNode
              key={child.stepId}
              step={child}
              selectedStepId={selectedStepId}
              onSelectStep={onSelectStep}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function StepTree({
  steps,
  selectedStepId,
  onSelectStep,
  depth = 0,
}: StepTreeProps) {
  if (steps.length === 0) {
    return (
      <p className="px-2 py-4 text-sm text-[var(--sea-ink-soft)]">
        No steps yet — waiting for events.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {steps.map((step) => (
        <StepTreeNode
          key={step.stepId}
          step={step}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
          depth={depth}
        />
      ))}
    </ul>
  );
}
