import { useEffect, useRef, useState } from "react";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";
import { useInspectorConnection } from "#/lib/inspector-connection";

interface UseAgentRunEventsOptions {
  /** Connect after a turn starts and the server has linked the session agentCallId. */
  enabled?: boolean;
  /** Transcript advanced (tool results committed or episode finished); refresh messages. */
  onFinished?: () => void;
  /** Title updated (e.g. sidebar); avoid refetching messages here to prevent UI flash. */
  onTitleSet?: () => void;
}

/**
 * Subscribes to standalone agent run events via SSE (`agent_text_delta`, etc.).
 * Workflow-embedded agents use {@link useWorkflowRunEvents} instead.
 *
 * A conversation turn may include several model requests (tool loop) under one
 * `agentCallId`. `isRunning` stays true until the SSE stream closes; `onFinished`
 * also fires when messages are committed so tool calls appear before the next
 * request streams text.
 */
export function useAgentRunEvents(memoryScope: string, options: UseAgentRunEventsOptions = {}) {
  const { enabled = true, onFinished, onTitleSet } = options;
  const { offline } = useInspectorConnection();
  const [streamingText, setStreamingText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const lastSeqRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  const onTitleSetRef = useRef(onTitleSet);
  onFinishedRef.current = onFinished;
  onTitleSetRef.current = onTitleSet;

  useEffect(() => {
    lastSeqRef.current = 0;
    setStreamingText("");
    setIsRunning(false);
  }, [memoryScope]);

  useEffect(() => {
    if (offline) {
      setIsRunning(false);
    }
  }, [offline]);

  useEffect(() => {
    if (!enabled || offline) {
      setIsRunning(false);
      return;
    }

    lastSeqRef.current = 0;
    setIsRunning(true);
    setStreamingText("");

    const source = new EventSource(
      `/api/agent-runs/${encodeURIComponent(memoryScope)}/events?afterSeq=${lastSeqRef.current}`,
    );

    const stop = () => {
      setIsRunning(false);
      onFinishedRef.current?.();
      source.close();
    };

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

        if (event.type === "agent_title_set") {
          onTitleSetRef.current?.();
        }

        if (event.type === "agent_messages_committed") {
          setStreamingText("");
          onFinishedRef.current?.();
        }

        if (event.type === "agent_finished") {
          onFinishedRef.current?.();
        }

        if (event.type === "agent_failed") {
          stop();
        }

        lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
      } catch {
        // ignore malformed chunks
      }
    };

    source.onerror = () => {
      stop();
    };

    return () => {
      source.close();
    };
  }, [memoryScope, enabled, offline]);

  return { streamingText, isRunning: isRunning && !offline };
}
