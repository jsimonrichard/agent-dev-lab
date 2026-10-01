import type { EpisodeTiming, EpisodeTimingSourceEvent } from "@agent-dev-lab/core/episode-timing";
import {
  computeEpisodeTimingByAgentCallId,
  isEpisodeTimingEvent,
} from "@agent-dev-lab/core/episode-timing";

import type { AgentEpisode, RunViewState, StepNode } from "./types";

export type { EpisodeTiming, EpisodeTimingSourceEvent };

/** Serializable timing-relevant fields for createServerFn / SSE side-channels. */
export type EpisodeTimingEventDto = {
  runSeq: number;
  at: string;
  agentCallId: string;
  type:
    | "agent_started"
    | "agent_finished"
    | "agent_failed"
    | "agent_tool_call"
    | "agent_tool_result";
  toolCallId?: string;
  preliminary?: boolean;
};

export function toEpisodeTimingEventDto(event: {
  type: string;
  at: string;
  runSeq: number;
  agentCallId?: string;
  toolCallId?: string;
  preliminary?: boolean;
}): EpisodeTimingEventDto | null {
  if (!isEpisodeTimingEvent(event) || !event.agentCallId) {
    return null;
  }
  const dto: EpisodeTimingEventDto = {
    runSeq: event.runSeq,
    at: event.at,
    agentCallId: event.agentCallId,
    type: event.type as EpisodeTimingEventDto["type"],
  };
  if (event.toolCallId) {
    dto.toolCallId = event.toolCallId;
  }
  if (event.preliminary === true) {
    dto.preliminary = true;
  }
  return dto;
}

export function filterTimingEventDtos(
  events: readonly {
    type: string;
    at: string;
    runSeq: number;
    agentCallId?: string;
    toolCallId?: string;
    preliminary?: boolean;
  }[],
): EpisodeTimingEventDto[] {
  const out: EpisodeTimingEventDto[] = [];
  for (const event of events) {
    const dto = toEpisodeTimingEventDto(event);
    if (dto) {
      out.push(dto);
    }
  }
  return out;
}

export function episodeTimingMapFromEvents(
  events: readonly EpisodeTimingSourceEvent[],
  nowMs?: number,
): Map<string, EpisodeTiming> {
  return computeEpisodeTimingByAgentCallId(events, nowMs != null ? { nowMs } : undefined);
}

function attachTimingToEpisode(
  episode: AgentEpisode,
  timings: ReadonlyMap<string, EpisodeTiming>,
): void {
  const timing = timings.get(episode.episodeId);
  if (!timing) {
    return;
  }
  episode.toolWaitMs = timing.toolWaitMs;
  episode.llmActiveMs = timing.llmActiveMs;
}

function walkSteps(steps: StepNode[], timings: ReadonlyMap<string, EpisodeTiming>): void {
  for (const step of steps) {
    for (const episode of step.agentEpisodes) {
      attachTimingToEpisode(episode, timings);
    }
    walkSteps(step.children, timings);
  }
}

/** Mutates `view` episodes with toolWaitMs / llmActiveMs from a timing map. */
export function attachEpisodeTiming(
  view: RunViewState,
  timings: ReadonlyMap<string, EpisodeTiming>,
): void {
  walkSteps(view.steps, timings);
}
