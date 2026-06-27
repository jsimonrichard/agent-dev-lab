import type { AdlRuntime, MessageStore, WorkflowStore } from "@agent-dev-lab/core";

import { getLoadedAdlProject } from "#/lib/adl-project";
import { registerAgentSessionFromEvent } from "#/lib/agent-sessions";

let observersRegistered = false;

/** Shared process runtime from the loaded ADL project (`adl.config.ts` → `src/adl.ts`). */
export async function getAdlRuntime(): Promise<AdlRuntime> {
  const project = await getLoadedAdlProject();
  const runtime = project.config.adl;
  if (!runtime) {
    throw new Error(
      'ADL project config is missing `adl` runtime. Add `adl` to adl.config.ts (e.g. `import { adl } from "./src/adl"`).',
    );
  }
  if (!observersRegistered) {
    runtime.services.observers.agents.push({
      onEvent: (event) => {
        registerAgentSessionFromEvent(event);
      },
    });
    observersRegistered = true;
  }
  return runtime;
}

export async function getWorkflowStore(): Promise<WorkflowStore> {
  const runtime = await getAdlRuntime();
  return runtime.services.stores.workflow;
}

export async function getMessageStore(): Promise<MessageStore> {
  const runtime = await getAdlRuntime();
  return runtime.services.stores.message;
}
