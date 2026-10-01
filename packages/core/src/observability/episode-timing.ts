/**
 * Wall / tool-wait / LLM-active breakdown for one agent episode, derived only from
 * recorded run-event timestamps (`agent_started` / `agent_finished` /
 * `agent_tool_call` / final `agent_tool_result`).
 *
 * Today's call/result pair is the post-materialize stand-in for the effect
 * intent/outcome model in `notes/execution-control-plan.md`. When suspend gaps
 * land on the event stream, re-attribute them explicitly — do not invent times.
 *
 * Accepts a minimal {@link EpisodeTimingSourceEvent} shape so hosts can pass
 * serializable DTOs (inspection UI) without shipping the full `RunEvent` union.
 */

export type EpisodeTiming = {
  agentCallId: string;
  /** `agent_finished`/`agent_failed` − `agent_started`, or started→now when `nowMs` is set. */
  wallMs: number;
  /** Union of per-`toolCallId` intervals from call to final non-preliminary result. */
  toolWaitMs: number;
  /** `max(0, wallMs − toolWaitMs)`. */
  llmActiveMs: number;
};

/** Minimal fields needed by {@link computeEpisodeTiming}. */
export type EpisodeTimingSourceEvent = {
  type: string;
  at: string;
  agentCallId?: string;
  toolCallId?: string;
  preliminary?: boolean;
};

type Interval = { startMs: number; endMs: number };

function parseAt(at: string): number | null {
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/** Inclusive union length of half-open-feeling wall intervals `[start, end]`. */
export function unionIntervalMs(intervals: readonly Interval[]): number {
  if (intervals.length === 0) {
    return 0;
  }
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let curStart = sorted[0]!.startMs;
  let curEnd = sorted[0]!.endMs;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.startMs <= curEnd) {
      curEnd = Math.max(curEnd, next.endMs);
    } else {
      total += Math.max(0, curEnd - curStart);
      curStart = next.startMs;
      curEnd = next.endMs;
    }
  }
  total += Math.max(0, curEnd - curStart);
  return total;
}

function isTimingRelevant(event: EpisodeTimingSourceEvent): boolean {
  return (
    event.type === "agent_started" ||
    event.type === "agent_finished" ||
    event.type === "agent_failed" ||
    event.type === "agent_tool_call" ||
    event.type === "agent_tool_result"
  );
}

/**
 * Events that participate in {@link computeEpisodeTiming} / {@link computeEpisodeTimingByAgentCallId}.
 * Useful for SSE side-channels without retaining the full core log.
 */
export function isEpisodeTimingEvent(event: EpisodeTimingSourceEvent): boolean {
  return isTimingRelevant(event);
}

function timingForCall(
  agentCallId: string,
  events: readonly EpisodeTimingSourceEvent[],
  nowMs: number | undefined,
): EpisodeTiming | null {
  let startedMs: number | null = null;
  let endedMs: number | null = null;
  const callStarts = new Map<string, number>();
  const intervals: Interval[] = [];

  for (const event of events) {
    if (event.agentCallId !== agentCallId) {
      continue;
    }
    const atMs = parseAt(event.at);
    if (atMs == null) {
      continue;
    }
    switch (event.type) {
      case "agent_started":
        startedMs = atMs;
        break;
      case "agent_finished":
      case "agent_failed":
        endedMs = atMs;
        break;
      case "agent_tool_call":
        if (event.toolCallId) {
          callStarts.set(event.toolCallId, atMs);
        }
        break;
      case "agent_tool_result":
        if (event.preliminary === true || !event.toolCallId) {
          break;
        }
        {
          const startMs = callStarts.get(event.toolCallId);
          if (startMs == null) {
            break;
          }
          intervals.push({ startMs, endMs: Math.max(startMs, atMs) });
          callStarts.delete(event.toolCallId);
        }
        break;
      default:
        break;
    }
  }

  if (startedMs == null) {
    return null;
  }
  const wallEnd = endedMs ?? nowMs;
  if (wallEnd == null || wallEnd < startedMs) {
    return null;
  }

  const wallMs = wallEnd - startedMs;
  const toolWaitMs = unionIntervalMs(intervals);
  return {
    agentCallId,
    wallMs,
    toolWaitMs,
    llmActiveMs: Math.max(0, wallMs - toolWaitMs),
  };
}

/**
 * Compute tool-wait vs LLM-active for a single episode from its (or a mixed) event list.
 * Returns `null` when `agent_started` is missing or the wall end cannot be determined
 * (no finish/fail and no `nowMs`).
 */
export function computeEpisodeTiming(
  events: readonly EpisodeTimingSourceEvent[],
  options?: { agentCallId?: string; nowMs?: number },
): EpisodeTiming | null {
  const agentCallId =
    options?.agentCallId ?? events.find((event) => event.agentCallId)?.agentCallId;
  if (!agentCallId) {
    return null;
  }
  return timingForCall(agentCallId, events, options?.nowMs);
}

/**
 * Group timing-relevant events by `agentCallId` and compute {@link EpisodeTiming} per episode.
 */
export function computeEpisodeTimingByAgentCallId(
  events: readonly EpisodeTimingSourceEvent[],
  options?: { nowMs?: number },
): Map<string, EpisodeTiming> {
  const byCall = new Map<string, EpisodeTimingSourceEvent[]>();
  for (const event of events) {
    if (!isTimingRelevant(event) || !event.agentCallId) {
      continue;
    }
    const list = byCall.get(event.agentCallId);
    if (list) {
      list.push(event);
    } else {
      byCall.set(event.agentCallId, [event]);
    }
  }
  const out = new Map<string, EpisodeTiming>();
  for (const [agentCallId, callEvents] of byCall) {
    const timing = timingForCall(agentCallId, callEvents, options?.nowMs);
    if (timing) {
      out.set(agentCallId, timing);
    }
  }
  return out;
}
