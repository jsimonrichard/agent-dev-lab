import type { AdlRuntime } from "@agent-dev-lab/core";
import type { LoadedAdlProject } from "@agent-dev-lab/core/project";

import { getAgentSessionByMemoryScope, registerAgentSessionFromEvent } from "#/lib/agent-sessions";
import { persistInspectorSession } from "#/lib/inspector-session-persist.server";

const inspectorAgentObserverState = {
  registered: false,
  listedAgentIds: new Set<string>(),
};

/** Drop the registration flag so the next {@link ensureInspectorAgentObserver} re-attaches. */
export function resetInspectorAgentObserver(): void {
  inspectorAgentObserverState.registered = false;
}

/**
 * Attach the inspection UI agent observer to `runtime` if it is not already attached
 * to this process's current generation. Safe to call more than once (sync).
 */
export function ensureInspectorAgentObserver(runtime: AdlRuntime, project: LoadedAdlProject): void {
  inspectorAgentObserverState.listedAgentIds = new Set(project.listAgentIds());
  if (inspectorAgentObserverState.registered) {
    return;
  }

  runtime.services.observers.agents.push({
    onEvent: (event) => {
      registerAgentSessionFromEvent(event, {
        listedAgentIds: inspectorAgentObserverState.listedAgentIds,
      });
      if (event.type === "agent_title_set") {
        const session = getAgentSessionByMemoryScope(event.memoryScope);
        if (session) {
          void persistInspectorSession(session);
        }
      }
    },
  });
  inspectorAgentObserverState.registered = true;
}
