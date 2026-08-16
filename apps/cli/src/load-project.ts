import path from "node:path";

import { AdlError } from "@agent-dev-lab/core";

import type { LoadedProjectForCli } from "./resolve-packages";
import { importProjectCore } from "./resolve-packages";

export async function loadCliProject(
  cwd: string,
  projectFlag?: string,
): Promise<LoadedProjectForCli> {
  const core = await importProjectCore(cwd);
  const projectRoot = path.resolve(projectFlag ?? core.findAdlProjectRootFromCwd(cwd));
  return core.loadAdlProject({ root: projectRoot });
}

export function requireWorkflow(project: LoadedProjectForCli, workflowId: string) {
  const workflow = project.getWorkflow(workflowId);
  if (!workflow) {
    const known = project.listWorkflowIds();
    const hint = known.length > 0 ? ` Known: ${known.join(", ")}.` : "";
    throw new AdlError("UNKNOWN_WORKFLOW", `Unknown workflow "${workflowId}".${hint}`);
  }
  return workflow;
}
