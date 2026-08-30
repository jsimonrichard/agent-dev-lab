import type { AdlCliContext } from "../../../context";
import { loadCliProject, requireAgent } from "../../../load-project";

interface RunFlags {
  project?: string;
  input: string;
  scope?: string;
}

export default async function run(
  this: AdlCliContext,
  flags: RunFlags,
  agentId: string,
): Promise<void> {
  const project = await loadCliProject(this.process.cwd(), flags.project);
  const agent = requireAgent(project, agentId);

  const handle = agent.run({
    user: flags.input,
    ...(flags.scope !== undefined ? { memoryScope: flags.scope } : {}),
  });
  this.process.stdout.write(`agentCallId ${handle.agentCallId}\n`);
  this.process.stdout.write(`memoryScope ${handle.memoryScope}\n`);
  const result = await handle.result;
  if (typeof result.output === "string") {
    this.process.stdout.write(`${result.output}\n`);
    return;
  }
  this.process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
}
