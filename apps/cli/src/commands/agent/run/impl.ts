import {
  AdlError,
  assertCatalogModelApiKey,
  resolveCatalogModel,
  type AdlModelCatalogEntry,
  type LanguageModel,
} from "@agent-dev-lab/core";

import type { AdlCliContext } from "../../../context";
import { loadCliProject, requireAgent } from "../../../load-project";

interface RunFlags {
  project?: string;
  input: string;
  scope?: string;
  "tool-context"?: string;
  model?: string;
}

export default async function run(
  this: AdlCliContext,
  flags: RunFlags,
  agentId: string,
): Promise<void> {
  const project = await loadCliProject(this.process.cwd(), flags.project);
  const agent = requireAgent(project, agentId);

  const toolContextJson = flags["tool-context"];
  let toolProviderContext: unknown;
  if (toolContextJson !== undefined) {
    try {
      toolProviderContext = JSON.parse(toolContextJson) as unknown;
    } catch (error) {
      throw new AdlError(
        "INVALID_INPUT",
        `Could not parse --tool-context as JSON: ${toolContextJson}`,
        { cause: error },
      );
    }
  }

  let model: LanguageModel | undefined;
  if (flags.model !== undefined) {
    const entry = project.getModel(flags.model);
    if (!entry) {
      throw new AdlError(
        "UNKNOWN_MODEL",
        `Unknown model catalog id "${flags.model}". Known ids: ${
          project.listModelIds().join(", ") || "(none)"
        }`,
      );
    }
    assertCatalogModelApiKey(entry as AdlModelCatalogEntry);
    model = resolveCatalogModel(
      {
        getModel: (id) => project.getModel(id) as AdlModelCatalogEntry | undefined,
        listModelIds: () => project.listModelIds(),
      },
      flags.model,
    );
  }

  const handle = agent.run({
    user: flags.input,
    ...(flags.scope !== undefined ? { memoryScope: flags.scope } : {}),
    ...(toolContextJson !== undefined ? { toolProviderContext } : {}),
    ...(model !== undefined ? { model } : {}),
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
