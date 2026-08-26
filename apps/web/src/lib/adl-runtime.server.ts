import type { AdlRuntime, MessageStore, WorkflowStore } from "@agent-dev-lab/core";

import { getLoadedAdlProject } from "#/lib/adl-project.server";
import {
  ensureInspectorAgentObserver,
  resetInspectorAgentObserver,
} from "#/lib/inspector-agent-observer.server";

export { resetInspectorAgentObserver };

/** Shared process runtime from the loaded ADL project (`adl.config.ts` → `src/adl.ts`). */
export async function getAdlRuntime(): Promise<AdlRuntime> {
  const project = await getLoadedAdlProject();
  const runtime = project.config.adl;
  if (!runtime) {
    throw new Error(
      'ADL project config is missing `adl` runtime. Add `adl` to adl.config.ts (e.g. `import { adl } from "./src/adl"`).',
    );
  }

  ensureInspectorAgentObserver(runtime, project);
  return runtime;
}

export async function getWorkflowStore(): Promise<WorkflowStore> {
  const runtime = await getAdlRuntime();
  const store = runtime.services.stores.workflow;
  if (!store) {
    throw new Error(
      "ADL runtime has no workflow store. The inspection UI requires `createAdlRuntime` to configure `stores.workflow`.",
    );
  }
  return store;
}

export async function getMessageStore(): Promise<MessageStore> {
  const runtime = await getAdlRuntime();
  return runtime.services.stores.message;
}
