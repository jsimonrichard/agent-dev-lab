import { formatDuration } from "@/lib/workflow/workflow-waterfall";

let hoverTipTimer = 0;
let hoverTipSource: Element | null = null;

export function hideHoverTip(tip: HTMLDivElement | null) {
  window.clearTimeout(hoverTipTimer);
  hoverTipSource = null;
  if (!tip) return;
  tip.style.display = "none";
  tip.textContent = "";
}

export function scheduleHoverTip(tip: HTMLDivElement | null, target: Element | null) {
  const source = target?.closest?.("[data-tip]") ?? null;
  if (source && source === hoverTipSource) return;
  hoverTipSource = source;
  window.clearTimeout(hoverTipTimer);
  if (!tip || !source) {
    if (tip) {
      tip.style.display = "none";
      tip.textContent = "";
    }
    return;
  }
  const text = (() => {
    const liveStart = source.getAttribute("data-wf-live-start");
    const liveLabel = source.getAttribute("data-wf-live-label");
    if (liveStart != null && liveLabel != null) {
      const startMs = Number(liveStart);
      if (Number.isFinite(startMs)) {
        return `${liveLabel}: ${formatDuration(Date.now() - startMs)} elapsed`;
      }
    }
    return source.getAttribute("data-tip");
  })();
  if (!text) {
    tip.style.display = "none";
    tip.textContent = "";
    return;
  }
  const maxWidth = source.getAttribute("data-tip-max");
  const rect = source.getBoundingClientRect();
  hoverTipTimer = window.setTimeout(() => {
    if (!tip.isConnected) return;
    tip.textContent = text;
    tip.style.maxWidth = maxWidth ?? "";
    tip.style.display = "block";
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
  }, 200);
}
