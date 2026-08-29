import { AdlError } from "@agent-dev-lab/core";

import type { AdlCliContext } from "../../../context";
import { loadCliProject, requireWorkflow } from "../../../load-project";

interface RunFlags {
  project?: string;
  input: string;
}

export default async function run(
  this: AdlCliContext,
  flags: RunFlags,
  workflowId: string,
): Promise<void> {
  const project = await loadCliProject(this.process.cwd(), flags.project);
  const workflow = requireWorkflow(project, workflowId);

  let parsed: unknown;
  try {
    parsed = JSON.parse(flags.input) as unknown;
  } catch (error) {
    throw new AdlError("INVALID_INPUT", `Could not parse --input as JSON: ${flags.input}`, {
      cause: error,
    });
  }

  const handle = workflow.run(parsed);
  this.process.stdout.write(`workflowRunId ${handle.workflowRunId}\n`);
  const result = await handle.result;
  this.process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
