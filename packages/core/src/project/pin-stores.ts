import type { MessageStore } from "../stores/types";
import type { WorkflowStore } from "../observability/workflow-store";
import type { RuntimeServices } from "../runtime/types";
import type { AdlProjectConfig } from "./config";

type StorePair = {
  message: MessageStore;
  workflow?: WorkflowStore;
};

function retargetItemStores(item: unknown, discarded: StorePair, previous: StorePair): void {
  if (!item || typeof item !== "object" || !("services" in item)) {
    return;
  }
  const services = (item as { services: RuntimeServices }).services;
  if (services.stores.message === discarded.message) {
    services.stores.message = previous.message;
  }
  if (discarded.workflow && previous.workflow && services.stores.workflow === discarded.workflow) {
    services.stores.workflow = previous.workflow;
  }
}

/**
 * After re-importing `adl.config`, keep the same {@link MessageStore} and
 * {@link WorkflowStore} object identities on the new runtime and registry entries
 * that still pointed at the discarded runtime stores.
 *
 * Store *config* changes (in-memory → sqlite, a different sqlite path) are ignored
 * until process restart. Per-agent `memory.store` / runtime store overrides are new
 * objects on each re-import and are not retargeted.
 *
 * Observer lists are **not** pinned. Reload re-evaluates `createAdlRuntime()`, so
 * late-attached observers (inspection UI) must be pushed again on the new arrays.
 */
export function pinRuntimeStores(
  previousConfig: AdlProjectConfig,
  nextConfig: AdlProjectConfig,
): void {
  const previousAdl = previousConfig.adl;
  const nextAdl = nextConfig.adl;
  if (!previousAdl || !nextAdl) {
    return;
  }

  const previousStores = previousAdl.services.stores;
  const discardedStores = nextAdl.services.stores;

  nextAdl.services.stores.message = previousStores.message;
  if (previousStores.workflow) {
    nextAdl.services.stores.workflow = previousStores.workflow;
  }

  for (const agent of nextConfig.agents ?? []) {
    retargetItemStores(agent, discardedStores, previousStores);
  }
  for (const workflow of nextConfig.workflows ?? []) {
    retargetItemStores(workflow, discardedStores, previousStores);
  }
}
