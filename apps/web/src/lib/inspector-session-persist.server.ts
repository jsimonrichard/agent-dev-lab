import { resolveAdlSqlitePath, sqliteInspectorSessionStore } from "@agent-dev-lab/core";

import { getLoadedAdlProject } from "#/lib/adl-project.server";
import type { AgentSession } from "#/lib/agent-sessions";

export async function persistInspectorSession(
  session: AgentSession,
  deletedAt?: string,
): Promise<void> {
  const project = await getLoadedAdlProject();
  const store = sqliteInspectorSessionStore({ path: resolveAdlSqlitePath(project.root) });
  store.upsert({
    memoryScope: session.memoryScope,
    agentId: session.agentId,
    agentCallId: session.agentCallId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    fork: session.fork,
    deletedAt,
  });
}
