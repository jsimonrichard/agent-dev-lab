import { useEffect, useRef, useState } from "react";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";

interface UseAgentRunEventsOptions {
  /** Connect after a turn starts and the server has linked the session agentCallId. */
  enabled?: boolean;
  onFinished?: () => void;
}

/**
 * Subscribes to standalone agent run events via SSE (`agent_text_delta`, etc.).
 * Workflow-embedded agents use {@link useWorkflowRunEvents} instead.
 */
export function useAgentRunEvents(memoryScope: string, options: UseAgentRunEventsOptions = {}) {
  const { enabled = true, onFinished } = options;
  const [streamingText, setStreamingText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const lastSeqRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    lastSeqRef.current = 0;
    setStreamingText("");
    setIsRunning(false);
  }, [memoryScope]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const source = new EventSource(
      `/api/agent-runs/${encodeURIComponent(memoryScope)}/events?afterSeq=${lastSeqRef.current}`,
    );

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as CoreRunEvent;

        if (event.type === "agent_started") {
          setIsRunning(true);
          setStreamingText("");
        }

        if (event.type === "agent_text_delta" && "delta" in event) {
          setStreamingText((prev) => prev + event.delta);
        }

        if (event.type === "agent_finished") {
          setIsRunning(false);
          onFinishedRef.current?.();
        }

        if (event.type === "agent_failed") {
          setIsRunning(false);
          onFinishedRef.current?.();
        }

        lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
      } catch {
        // ignore malformed chunks
      }
    };

    return () => {
      source.close();
    };
  }, [memoryScope, enabled]);

  return { streamingText, isRunning };
}
