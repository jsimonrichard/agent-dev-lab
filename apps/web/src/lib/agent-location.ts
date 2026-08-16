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
