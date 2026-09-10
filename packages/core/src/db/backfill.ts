import { asc } from "drizzle-orm";

import { applyProjections } from "./projections";
import { runEvents, schemaMigrations } from "./schema";
import type { AdlDb } from "./wrap-drizzle";

import type { RunEvent } from "../observability/events";

/**
 * One-time backfills, keyed in `adl_schema_migrations`.
 *
 * Bump a key (`…:v2`) to make a backfill run again — after fixing a projection
 * bug, say. The ledger is what makes "has this already run?" answerable;
 * proxies for it do not work. An earlier version of this used "the table is
 * empty", which silently never fired for `adl_conversation_metadata`, because
 * that table is the renamed `adl_inspector_sessions` and already holds the
 * rows the inspection UI wrote.
 */
const BACKFILLS: { key: string; eventTypes: RunEvent["type"][] }[] = [
  {
    key: "backfill:adl_agent_episodes:v1",
    eventTypes: ["agent_started", "agent_finished", "agent_failed"],
  },
  {
    key: "backfill:adl_conversation_metadata:v1",
    eventTypes: ["agent_title_set", "conversation_forked"],
  },
];

function appliedKeys(db: AdlDb): Set<string> {
  const rows = db.select({ id: schemaMigrations.id }).from(schemaMigrations).all();
  return new Set(rows.map((row) => row.id));
}

/**
 * Rebuilds entity tables from the retained event log.
 *
 * This is the payoff for events being the single source of truth: a table
 * added after a database already exists is not stuck empty, and it is not
 * populated by a second, migration-only code path that could disagree with the
 * live one. Replay goes through the very same {@link applyProjections} the
 * store calls on every `recordEvent`, so a rebuilt table cannot drift from a
 * live-written one — the reason those projections were extracted out of the
 * workflow store to begin with.
 *
 * Runs once per key, recorded in `adl_schema_migrations`, and is inherently
 * safe to repeat even so: every projection is an upsert keyed by the entity's
 * own id. Replay order is `adl_run_events.id`, the true append order, so an
 * episode's terminal event lands after its start.
 */
export function backfillProjections(db: AdlDb): void {
  const applied = appliedKeys(db);
  const pending = BACKFILLS.filter((backfill) => !applied.has(backfill.key));
  if (pending.length === 0) {
    return;
  }

  const wanted = new Set(pending.flatMap((backfill) => backfill.eventTypes));
  const rows = db
    .select({ payloadJson: runEvents.payloadJson })
    .from(runEvents)
    .orderBy(asc(runEvents.id))
    .all();

  for (const row of rows) {
    let event: RunEvent;
    try {
      event = JSON.parse(row.payloadJson) as RunEvent;
    } catch {
      // A single unparseable row must not abort the whole migration; the log
      // is append-only and this row's projection is simply unrecoverable.
      continue;
    }
    if (!wanted.has(event.type)) {
      continue;
    }
    applyProjections(db, event);
  }

  // Recorded even when the log held nothing to replay (a fresh database), so
  // the log is not rescanned on every open from here on.
  const appliedAt = new Date().toISOString();
  for (const backfill of pending) {
    db.insert(schemaMigrations).values({ id: backfill.key, appliedAt }).onConflictDoNothing().run();
  }
}

/** Test seam: the keys this module would apply, in order. */
export function backfillKeys(): string[] {
  return BACKFILLS.map((backfill) => backfill.key);
}
