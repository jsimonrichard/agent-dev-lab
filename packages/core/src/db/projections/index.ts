/**
 * Entity-table projections over the append-only event log.
 *
 * Events in `adl_run_events` are the single source of truth; every table
 * these functions write is a read model rebuildable by replay. The store's
 * `recordEvent` and the schema migration's backfill both go through
 * {@link applyProjections}, so a rebuilt table cannot drift from a
 * live-written one.
 */
import type { AdlDb } from "../index";

import { projectAgentEpisode } from "./agent-episodes";
import { projectStepRecord } from "./step-records";
import { projectWorkflowRun } from "./workflow-runs";

import type { RunEvent } from "../../observability/events";

export { stepSlotKey } from "./step-records";

/** Applies every projection for one event. Caller appends the event row first. */
export function applyProjections(db: AdlDb, event: RunEvent): void {
  projectWorkflowRun(db, event);
  projectStepRecord(db, event);
  projectAgentEpisode(db, event);
}
