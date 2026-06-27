/** Parsed workflow section of the inspection UI URL. */
export type WorkflowPath = {
  workflowId?: string;
  runId?: string;
};

/** Parsed agent section of the inspection UI URL. */
export type AgentPath = {
  agentId?: string;
  runId?: string;
};

export function parseWorkflowPath(pathname: string): WorkflowPath {
  const match = pathname.match(/^\/workflows(?:\/([^/]+)(?:\/r\/([^/]+))?)?/);
  return {
    workflowId: match?.[1],
    runId: match?.[2],
  };
}

export function parseAgentPath(pathname: string): AgentPath {
  const match = pathname.match(/^\/agent(?:\/([^/]+)(?:\/r\/([^/]+))?)?/);
  return {
    agentId: match?.[1],
    runId: match?.[2],
  };
}
