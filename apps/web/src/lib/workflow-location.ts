export type WorkflowRunSearch = {
  step?: string;
  episode?: string;
};

export function parseWorkflowRunSearch(search: Record<string, unknown>): WorkflowRunSearch {
  const step = typeof search.step === "string" && search.step.length > 0 ? search.step : undefined;
  const episode =
    typeof search.episode === "string" && search.episode.length > 0 ? search.episode : undefined;
  return {
    ...(step ? { step } : {}),
    ...(episode ? { episode } : {}),
  };
}

export function parseWorkflowLocation(pathname: string): {
  workflowId?: string;
  runId?: string;
} {
  const runMatch = pathname.match(/^\/workflows\/([^/]+)\/run\/([^/]+)/);
  if (runMatch) {
    return { workflowId: runMatch[1], runId: runMatch[2] };
  }
  const workflowMatch = pathname.match(/^\/workflows\/([^/]+)/);
  if (workflowMatch?.[1]) {
    return { workflowId: workflowMatch[1] };
  }
  return {};
}

export function formatRunTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

/** Display label for a run: user title when set, otherwise the stable run id. */
export function workflowRunLabel(run: { runId: string; title?: string }): string {
  const title = run.title?.trim();
  return title ? title : run.runId;
}

/** Secondary line for a run: timestamp and input preview. */
export function workflowRunSubtitle(run: {
  runId: string;
  title?: string;
  startedAt: string;
  inputPreview?: string;
}): string {
  const parts = [
    formatRunTimestamp(run.startedAt),
    run.inputPreview && run.inputPreview !== "{}" ? run.inputPreview : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}
