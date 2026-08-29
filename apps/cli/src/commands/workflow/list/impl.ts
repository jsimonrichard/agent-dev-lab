import type { AdlCliContext } from "../../../context";
import { loadCliProject } from "../../../load-project";

interface ListFlags {
  project?: string;
}

export default async function list(this: AdlCliContext, flags: ListFlags): Promise<void> {
  const project = await loadCliProject(this.process.cwd(), flags.project);
  const ids = project.listWorkflowIds();
  if (ids.length === 0) {
    this.process.stdout.write("No workflows registered.\n");
    return;
  }
  for (const id of ids) {
    this.process.stdout.write(`${id}\n`);
  }
}
