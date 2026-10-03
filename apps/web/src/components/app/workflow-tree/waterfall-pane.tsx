import { type ReactNode, type RefObject } from "react";

import { WaterfallGridLines, WaterfallHeader, WaterfallRetryLine } from "./waterfall";

export function WaterfallPane({
  scrollRef,
  zoom,
  ticks,
  retryLinePct,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  ticks: { pct: number; label: string }[];
  retryLinePct: number | null;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain"
    >
      <div
        className="relative flex min-h-full flex-col"
        style={{ width: `${Math.max(zoom, 1) * 100}%` }}
      >
        <WaterfallHeader ticks={ticks} retryLinePct={retryLinePct} />
        <div className="relative z-0 flex min-h-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-y-0 right-3 left-3 z-[1]">
            <WaterfallGridLines ticks={ticks} />
            {retryLinePct != null ? <WaterfallRetryLine pct={retryLinePct} /> : null}
          </div>
          {children}
          <div className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  );
}
