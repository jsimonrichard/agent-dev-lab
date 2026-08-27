import type { AdlRuntime } from "@agent-dev-lab/core";
import {
  clearInspectorAgentObserverAttached,
  getInspectorListedAgentIds,
  markInspectorAgentObserverAttached,
  setInspectorListedAgentIds,
  type LoadedAdlProject,
} from "@agent-dev-lab/core/project";

import { getAgentSessionByMemoryScope, registerAgentSessionFromEvent } from "#/lib/agent-sessions";
import { persistInspectorSession } from "#/lib/inspector-session-persist.server";

/** Drop the registration flag so the next {@link ensureInspectorAgentObserver} re-attaches. */
export function resetInspectorAgentObserver(): void {
  clearInspectorAgentObserverAttached();
}

/**
 * Attach the inspection UI agent observer to `runtime` if it is not already attached
 * to this process's current generation. Safe to call more than once (sync).
 */
export function ensureInspectorAgentObserver(runtime: AdlRuntime, project: LoadedAdlProject): void {
  setInspectorListedAgentIds(project.listAgentIds());
  if (!markInspectorAgentObserverAttached()) {
    return;
  }

  runtime.services.observers.agents.push({
    onEvent: (event) => {
      registerAgentSessionFromEvent(event, {
        listedAgentIds: getInspectorListedAgentIds(),
      });
      if (event.type === "agent_title_set") {
        const session = getAgentSessionByMemoryScope(event.memoryScope);
        if (session) {
          void persistInspectorSession(session);
        }
      }
    },
  });
}
