import { cn } from "@/lib/utils";
import { formatDuration, type WaterfallBar } from "@/lib/workflow/workflow-waterfall";
import type { StepNodeStatus } from "@/lib/view-model/types";

import { PANE_HEADER_CLASS } from "./constants";

export function WaterfallHeader({
  ticks,
  retryLinePct,
}: {
  ticks: { pct: number; label: string }[];
  retryLinePct: number | null;
}) {
  return (
    <div className={cn(PANE_HEADER_CLASS, "px-3")}>
      <div className="relative h-full">
        <WaterfallGridLines ticks={ticks} />
        {ticks.map((tick) => (
          <span
            key={tick.pct}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground",
              tick.pct === 0
                ? "translate-x-0"
                : tick.pct === 100
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{ left: `${tick.pct}%` }}
          >
            {tick.label}
          </span>
        ))}
        {retryLinePct != null ? <WaterfallRetryLine pct={retryLinePct} tip /> : null}
      </div>
    </div>
  );
}

/**
 * Hue is the row kind. Opacity is copied versus re-run: a real bar is /40,
 * a copied one is /15. Spans past the retry point add a hairline dashed
 * border in that same hue.
 */
export type WaterfallKind = "workflow" | "step" | "agent";

/** Layout-only floor so sub-pixel % widths stay visible; does not pad stored durations. */
const WATERFALL_BAR_MIN_WIDTH_PX = 4;

const WATERFALL_KIND_CLASS: Record<
  WaterfallKind,
  { real: string; copied: string; afterAnchor: string; running: string; edge: string }
> = {
  workflow: {
    real: "bg-indigo-400/40",
    copied: "bg-indigo-400/15",
    afterAnchor: "border border-dashed border-indigo-400/45 bg-indigo-400/15",
    running: "bg-indigo-400/60",
    edge: "bg-indigo-300",
  },
  step: {
    real: "bg-fuchsia-400/40",
    copied: "bg-fuchsia-400/15",
    afterAnchor: "border border-dashed border-fuchsia-400/45 bg-fuchsia-400/15",
    running: "bg-fuchsia-400/60",
    edge: "bg-fuchsia-300",
  },
  agent: {
    real: "bg-emerald-400/40",
    copied: "bg-emerald-400/15",
    afterAnchor: "border border-dashed border-emerald-400/45 bg-emerald-400/15",
    running: "bg-emerald-400/60",
    edge: "bg-emerald-300",
  },
};

function waterfallBarTooltip(bar: WaterfallBar, label: string, status: StepNodeStatus): string {
  if (bar.afterAnchor) {
    return `${label}: copied ${formatDuration(bar.durationMs)} from the prior attempt. Placed after the retry point — order in comparison with re-executed steps is not meaningful.`;
  }
  if (bar.copied) {
    const parts = [
      `${label}: prior layout ${formatDuration(bar.durationMs)}`,
      bar.priorDurationMs != null ? `full prior ${formatDuration(bar.priorDurationMs)}` : null,
      bar.continuation
        ? `copied past retry ${formatDuration(bar.continuation.durationMs)} (order versus re-executed steps is not meaningful)`
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }
  if (bar.copiedPrefix) {
    return `${label}: ${formatDuration(bar.durationMs)}. Begins with ${formatDuration(bar.copiedPrefix.durationMs)} copied from the prior attempt, before the retry point.`;
  }
  return `${label}: ${formatDuration(bar.durationMs)}${status === "running" ? " elapsed" : ""}`;
}

export function WaterfallTrack({
  bar,
  status,
  label,
  kind,
}: {
  bar: WaterfallBar | null;
  status: StepNodeStatus;
  label: string;
  kind: WaterfallKind;
}) {
  const tone = WATERFALL_KIND_CLASS[kind];
  const heightClass = kind === "agent" ? "h-2.5" : "h-3.5";
  return (
    <div className="relative h-8 overflow-hidden">
      {bar?.continuation ? (
        <span
          data-tip={`Copied ${formatDuration(bar.continuation.durationMs)} from the prior attempt, past the retry point. Not re-measured here — order versus re-executed steps is not meaningful.`}
          className={cn(
            "absolute top-1/2 z-0 -translate-y-1/2 rounded-sm",
            tone.afterAnchor,
            heightClass,
          )}
          style={{
            left: `${bar.continuation.leftPct}%`,
            width: `${bar.continuation.widthPct}%`,
            minWidth: WATERFALL_BAR_MIN_WIDTH_PX,
          }}
          aria-hidden
        />
      ) : null}
      {bar?.copiedPrefix ? (
        <span
          data-tip={`Copied ${formatDuration(bar.copiedPrefix.durationMs)} from the prior attempt, before the retry point.`}
          className={cn(
            "absolute top-1/2 z-[2] -translate-y-1/2 rounded-sm",
            tone.copied,
            heightClass,
          )}
          style={{
            left: `${bar.copiedPrefix.leftPct}%`,
            width: `${bar.copiedPrefix.widthPct}%`,
            minWidth: WATERFALL_BAR_MIN_WIDTH_PX,
          }}
          aria-hidden
        />
      ) : null}
      {bar ? (
        <span
          data-tip={waterfallBarTooltip(bar, label, status)}
          className={cn(
            "absolute top-1/2 z-[1] -translate-y-1/2 rounded-sm",
            heightClass,
            bar.copied && bar.afterAnchor && tone.afterAnchor,
            bar.copied && !bar.afterAnchor && tone.copied,
            !bar.copied && status === "running" && tone.running,
            !bar.copied && status === "completed" && tone.real,
            !bar.copied && status === "failed" && "bg-destructive/55",
          )}
          style={{
            left: `${bar.leftPct}%`,
            width: `${bar.widthPct}%`,
            minWidth: WATERFALL_BAR_MIN_WIDTH_PX,
          }}
        >
          {!bar.copied && status === "running" ? (
            <span className={cn("absolute inset-y-0 right-0 w-0.5 rounded-r-sm", tone.edge)} />
          ) : null}
        </span>
      ) : (
        <span className="sr-only">No timing yet</span>
      )}
      {bar ? <WaterfallDuration bar={bar} status={status} /> : null}
    </div>
  );
}

function waterfallDurationOffset(bar: WaterfallBar): string {
  return `min(calc(${bar.leftPct + bar.widthPct}% + 6px), calc(100% - 2.75rem))`;
}

function WaterfallDuration({ bar, status }: { bar: WaterfallBar; status: StepNodeStatus }) {
  const duration = formatDuration(bar.durationMs);
  const left = waterfallDurationOffset(bar);
  const rightClipPct = Math.max(0, 100 - bar.leftPct - bar.widthPct);
  const labelClass =
    "absolute top-1/2 -translate-y-1/2 font-mono text-[10px] leading-none tabular-nums";

  return (
    <>
      <span
        className={cn("pointer-events-none z-1 text-muted-foreground", labelClass)}
        style={{ left }}
      >
        {duration}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-1 overflow-hidden"
        style={{
          clipPath: `inset(0 ${rightClipPct}% 0 ${bar.leftPct}%)`,
        }}
      >
        <span
          className={cn(labelClass, status === "failed" ? "text-white" : "text-black")}
          style={{ left }}
        >
          {duration}
        </span>
      </span>
    </>
  );
}

const RETRY_LINE_TIP =
  "Retry point. Time left of this line was copied from the prior attempt; this run starts here.";

/** 1px marker at the first re-executed step. Sits with the grid, under the bars. */
export function WaterfallRetryLine({ pct, tip = false }: { pct: number; tip?: boolean }) {
  return (
    <span
      data-testid="waterfall-retry-line"
      data-tip={tip ? RETRY_LINE_TIP : undefined}
      className={cn(
        "absolute inset-y-0 -translate-x-1/2",
        // The ruler copy is the hover target. The chart copy stays click-through.
        tip ? "pointer-events-auto w-3" : "pointer-events-none w-px",
      )}
      style={{ left: `${pct}%` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-sky-500/20 dark:bg-sky-400/15"
      />
    </span>
  );
}

export function WaterfallGridLines({ ticks }: { ticks: { pct: number }[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <span
          key={tick.pct}
          className="absolute inset-y-0 w-px bg-border/40"
          style={tick.pct === 100 ? { right: 0 } : { left: `${tick.pct}%` }}
        />
      ))}
    </div>
  );
}
