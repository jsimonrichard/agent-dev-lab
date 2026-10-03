import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils";

export function useLiveNow(active: boolean): number {
  // Start at 0 on both server and client so SSR HTML matches hydration. A real
  // clock is applied after mount (see hydration mismatch on duration labels).
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = window.setInterval(() => {
      startTransition(() => setNow(Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const TREE_COL_MIN = 224;
const WATERFALL_COL_MIN = 192;
const TREE_COL_DEFAULT_RATIO = 0.4;
const WATERFALL_ZOOM_MIN = 1;
const WATERFALL_ZOOM_MAX = 16;

function clampTreeWidth(width: number, containerWidth: number): number {
  const max = Math.max(TREE_COL_MIN, containerWidth - WATERFALL_COL_MIN);
  return Math.min(Math.max(width, TREE_COL_MIN), max);
}

function clampWaterfallZoom(zoom: number): number {
  return Math.min(WATERFALL_ZOOM_MAX, Math.max(WATERFALL_ZOOM_MIN, zoom));
}

export function useColumnSplit() {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [treeWidth, setTreeWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const applyWidth = useCallback((width: number) => {
    const nextContainer = containerRef.current?.clientWidth ?? 0;
    if (nextContainer <= 0) {
      setTreeWidth(width);
      return;
    }
    setTreeWidth(clampTreeWidth(width, nextContainer));
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const sync = () => {
      setTreeWidth((current) => {
        const fallback = Math.round(el.clientWidth * TREE_COL_DEFAULT_RATIO);
        const next = clampTreeWidth(current ?? fallback, el.clientWidth);
        return current === next ? current : next;
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const width =
        treeWidth ?? Math.round((containerRef.current?.clientWidth ?? 0) * TREE_COL_DEFAULT_RATIO);
      dragRef.current = { startX: event.clientX, startWidth: width };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [treeWidth],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyWidth(drag.startWidth + event.clientX - drag.startX);
    },
    [applyWidth],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onReset = useCallback(() => {
    const nextContainer = containerRef.current?.clientWidth ?? 0;
    applyWidth(Math.round(nextContainer * TREE_COL_DEFAULT_RATIO));
  }, [applyWidth]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const nextContainer = containerRef.current?.clientWidth ?? 0;
      const current = treeWidth ?? Math.round(nextContainer * TREE_COL_DEFAULT_RATIO);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        applyWidth(current - 16);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        applyWidth(current + 16);
      } else if (event.key === "Home") {
        event.preventDefault();
        applyWidth(TREE_COL_MIN);
      } else if (event.key === "End") {
        event.preventDefault();
        applyWidth(nextContainer - WATERFALL_COL_MIN);
      }
    },
    [applyWidth, treeWidth],
  );

  return {
    containerRef,
    treeWidth,
    handleLeft: treeWidth == null ? "40%" : treeWidth,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
    onReset,
  };
}

export function useSyncedVerticalScroll(
  treeRef: RefObject<HTMLDivElement | null>,
  waterfallRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const tree = treeRef.current;
    const waterfall = waterfallRef.current;
    if (!tree || !waterfall) return;

    let source: "tree" | "waterfall" | null = null;

    const onTreeScroll = () => {
      if (source === "waterfall") return;
      source = "tree";
      waterfall.scrollTop = tree.scrollTop;
      source = null;
    };
    const onWaterfallScroll = () => {
      if (source === "tree") return;
      source = "waterfall";
      tree.scrollTop = waterfall.scrollTop;
      source = null;
    };

    tree.addEventListener("scroll", onTreeScroll, { passive: true });
    waterfall.addEventListener("scroll", onWaterfallScroll, { passive: true });
    return () => {
      tree.removeEventListener("scroll", onTreeScroll);
      waterfall.removeEventListener("scroll", onWaterfallScroll);
    };
  }, [treeRef, waterfallRef, enabled]);
}

export function useScrollbarGutter(
  waterfallRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  rowCount: number,
) {
  const [gutter, setGutter] = useState(0);

  useLayoutEffect(() => {
    const el = waterfallRef.current;
    if (!el) return;

    const sync = () => {
      const next = Math.max(0, el.offsetHeight - el.clientHeight);
      setGutter((prev) => (prev === next ? prev : next));
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [waterfallRef, zoom, rowCount]);

  return gutter;
}

export function useWaterfallZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  setZoom: (zoom: number) => void,
  enabled: boolean,
) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const anchorRef = useRef<{ fraction: number; localX: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const viewport = scrollRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const current = zoomRef.current;
      const next = clampWaterfallZoom(current * 2 ** (-event.deltaY / 200));
      if (Math.abs(next - current) < 0.001) return;

      const rect = viewport.getBoundingClientRect();
      const localX = Math.max(0, event.clientX - rect.left);
      const contentWidth = Math.max(1, viewport.scrollWidth);
      const fraction = (viewport.scrollLeft + localX) / contentWidth;
      anchorRef.current = { fraction, localX };
      setZoom(next);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [scrollRef, setZoom, enabled]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.scrollLeft = anchor.fraction * viewport.scrollWidth - anchor.localX;
  }, [zoom, scrollRef]);
}

export function ColumnResizeHandle({
  left,
  dragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onDoubleClick,
}: {
  left: number | string;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Resize tree and waterfall"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        "absolute inset-y-0 z-20 flex w-1.5 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center",
        "bg-transparent hover:bg-border focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden",
        dragging && "bg-border",
      )}
      style={{ left }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border",
          dragging && "bg-foreground/50",
        )}
      />
    </button>
  );
}
