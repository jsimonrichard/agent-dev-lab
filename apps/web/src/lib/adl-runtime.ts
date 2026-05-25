import type { AdlRuntime, MessageStore, WorkflowStore } from "@agent-dev-lab/core";
import type { RunEvent } from "@agent-dev-lab/core";

import { getLoadedAdlProject } from "#/lib/adl-project";
import { registerAgentSessionFromEvent } from "#/lib/agent-sessions";

let patchedStore = false;

/** Shared process runtime from the loaded ADL project (`src/adl.ts`). */
export async function getAdlRuntime(): Promise<AdlRuntime> {
  const project = await getLoadedAdlProject();
  const runtime = project.config.adl;
  if (!runtime) {
    throw new Error(
      "ADL project config is missing `adl` runtime. Export createAdlRuntime() from src/adl.ts.",
    );
  }
  if (!patchedStore) {
    patchWorkflowStore(runtime.services.stores.workflow);
    patchedStore = true;
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

function patchWorkflowStore(store: WorkflowStore): void {
  const record = store.recordEvent.bind(store);
  store.recordEvent = async (event: RunEvent) => {
    registerAgentSessionFromEvent(event);
    return record(event);
  };
}
