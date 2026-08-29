export function parseAgentLocation(pathname: string): {
  agentId?: string;
  runId?: string;
} {
  const runMatch = pathname.match(/^\/agent\/([^/]+)\/run\/([^/]+)/);
  if (runMatch) {
    return { agentId: runMatch[1], runId: runMatch[2] };
  }
  const agentMatch = pathname.match(/^\/agent\/([^/]+)/);
  if (agentMatch?.[1]) {
    return { agentId: agentMatch[1] };
  }
  return {};
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
