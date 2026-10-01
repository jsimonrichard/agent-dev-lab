export function parseAgentLocation(pathname: string): {
  agentId?: string;
  runId?: string;
} {
  const runMatch = pathname.match(/^\/agent\/([^/]+)\/run\/([^/]+)/);
  if (runMatch?.[1] && runMatch[2]) {
    return {
      agentId: decodePathSegment(runMatch[1]),
      runId: decodePathSegment(runMatch[2]),
    };
  }
  const agentMatch = pathname.match(/^\/agent\/([^/]+)/);
  if (agentMatch?.[1]) {
    return { agentId: decodePathSegment(agentMatch[1]) };
  }
  return {};
}

/** Decode a path segment; leave the raw string if it is not valid URI encoding. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export type AgentRunSearch = {
  call?: string;
};

export function parseAgentRunSearch(search: Record<string, unknown>): AgentRunSearch {
  const call = typeof search.call === "string" && search.call.length > 0 ? search.call : undefined;
  return call ? { call } : {};
}

/** Search object for a conversation inspector selection (`?call=`). */
export function agentRunSearch(selection: { call?: string | null }): AgentRunSearch {
  return selection.call ? { call: selection.call } : {};
}
