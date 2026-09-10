import type { AdlDb } from "../index";
import { conversationMetadata } from "../schema";

import type { RunEvent } from "../../observability/events";

/**
 * Projects `agent_title_set` into `adl_conversation_metadata`.
 *
 * Before this existed, the only writer was `apps/web`'s
 * `persistInspectorSession`, so core generated a title in
 * `maybeSetConversationTitle`, emitted the event, and had nowhere to put it —
 * a headless `adl run` dropped it. Projecting here means a row exists for
 * every conversation that sets a title, not only those created through the UI.
 *
 * **Column ownership.** This writes only the columns the event can speak for:
 * `memory_scope`, `agent_id`, `agent_call_id`, `title`, and the timestamps.
 * `fork_json` and `deleted_at` stay owned by whoever set them — the conflict
 * update deliberately leaves them alone, so a UI-set fork lineage or a soft
 * delete survives a later title change.
 */
export function projectConversationMetadata(db: AdlDb, event: RunEvent): void {
  if (event.type === "agent_title_set") {
    db.insert(conversationMetadata)
      .values({
        memoryScope: event.memoryScope,
        agentId: event.agentId,
        agentCallId: event.agentCallId,
        title: event.title,
        createdAt: event.at,
        updatedAt: event.at,
      })
      .onConflictDoUpdate({
        target: conversationMetadata.memoryScope,
        set: {
          agentId: event.agentId,
          agentCallId: event.agentCallId,
          title: event.title,
          updatedAt: event.at,
          // createdAt intentionally absent: the row's first title is its
          // creation, and a re-title must not move it.
        },
      })
      .run();
    return;
  }

  if (event.type === "conversation_forked") {
    // A fork is the row's first writer and has no episode yet, so agentCallId
    // is left null — the constraint that used to forbid that is gone. On
    // conflict only fork lineage is written: this event owns fork_json, and
    // must not walk back a title or agent set by a later event during replay.
    db.insert(conversationMetadata)
      .values({
        memoryScope: event.memoryScope,
        agentId: event.agentId,
        title: event.title,
        createdAt: event.at,
        updatedAt: event.at,
        forkJson: JSON.stringify(event.fork),
      })
      .onConflictDoUpdate({
        target: conversationMetadata.memoryScope,
        set: {
          forkJson: JSON.stringify(event.fork),
          updatedAt: event.at,
        },
      })
      .run();
  }
}
