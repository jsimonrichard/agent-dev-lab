import { type CSSProperties, type ReactNode, type Ref, type RefObject } from "react";

import { waterfallAxisStyle, type WaterfallScale } from "@/lib/workflow/workflow-waterfall";

import { WaterfallGridLines, WaterfallHeader, WaterfallRetryLine } from "./waterfall";

export function WaterfallPane({
  scrollRef,
  axisRef,
  zoom,
  scale,
  nowMs,
  live,
  ticks,
  retryAnchorMs,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  axisRef: Ref<HTMLDivElement | null>;
  zoom: number;
  scale: WaterfallScale;
  nowMs: number;
  live: boolean;
  ticks: { pct: number }[];
  retryAnchorMs: number | null;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain"
    >
      <div
        ref={axisRef}
        data-waterfall-axis
        className="relative flex min-h-full flex-col"
        style={{
          width: `${Math.max(zoom, 1) * 100}%`,
          ...(waterfallAxisStyle(scale, nowMs) as CSSProperties),
        }}
      >
        <WaterfallHeader scale={scale} zoom={zoom} live={live} retryAnchorMs={retryAnchorMs} />
        <div className="relative z-0 flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-y-0 right-3 left-3 z-[1]">
            <WaterfallGridLines ticks={ticks} />
            {retryAnchorMs != null ? <WaterfallRetryLine anchorMs={retryAnchorMs} /> : null}
          </div>
          {children}
          <div className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  );
}
