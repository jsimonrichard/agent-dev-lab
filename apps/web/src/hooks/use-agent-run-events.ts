import { useEffect, useRef, useState } from "react";

import type { RunEvent as CoreRunEvent } from "@agent-dev-lab/core";
import { useInspectorConnection } from "#/lib/inspector-connection";

interface UseAgentRunEventsOptions {
  /** Connect after a turn starts and the server has linked the session agentCallId. */
  enabled?: boolean;
  /**
   * Transcript advanced (tool results committed or episode finished); refresh messages.
   * May return a promise — streamed text is held until it settles so the final assistant
   * bubble is not cleared before the persisted transcript is on screen.
   */
  onFinished?: () => void | Promise<void>;
  /** Title updated (e.g. sidebar); avoid refetching messages here to prevent UI flash. */
  onTitleSet?: () => void;
  /**
   * Surfaces failures from `onFinished` refresh work (and later `agent_failed`).
   * Required — otherwise refresh rejections become silent or unhandled.
   */
  onError: (error: unknown) => void;
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
export function useAgentRunEvents(memoryScope: string, options: UseAgentRunEventsOptions) {
  const { enabled = true, onFinished, onTitleSet, onError } = options;
  const { offline } = useInspectorConnection();
  const [streamingText, setStreamingText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const lastSeqRef = useRef(0);
  const streamingTextRef = useRef("");
  const onFinishedRef = useRef(onFinished);
  const onTitleSetRef = useRef(onTitleSet);
  const onErrorRef = useRef(onError);
  onFinishedRef.current = onFinished;
  onTitleSetRef.current = onTitleSet;
  onErrorRef.current = onError;

  useEffect(() => {
    lastSeqRef.current = 0;
    streamingTextRef.current = "";
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
      // Drop held text when the client disables the stream (new send) so the
      // previous turn cannot reappear beside the next optimistic user message.
      streamingTextRef.current = "";
      setStreamingText("");
      return;
    }

    lastSeqRef.current = 0;
    setIsRunning(true);
    streamingTextRef.current = "";
    setStreamingText("");

    const source = new EventSource(
      `/api/agent-runs/${encodeURIComponent(memoryScope)}/events?afterSeq=${lastSeqRef.current}`,
    );

    const applyStreamingText = (value: string | ((prev: string) => string)) => {
      setStreamingText((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        streamingTextRef.current = next;
        return next;
      });
    };

    const refreshAfterCommit = () => {
      const snapshot = streamingTextRef.current;
      const result = onFinishedRef.current?.();
      void Promise.resolve(result)
        .catch((error: unknown) => {
          onErrorRef.current(error);
        })
        .finally(() => {
          // Drop the pre-commit buffer only if no newer deltas arrived (next tool-loop step).
          setStreamingText((prev) => {
            if (prev !== snapshot) {
              streamingTextRef.current = prev;
              return prev;
            }
            streamingTextRef.current = "";
            return "";
          });
        });
    };

    const stop = () => {
      setIsRunning(false);
      refreshAfterCommit();
      source.close();
    };

    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as CoreRunEvent;

        if (event.type === "agent_started") {
          setIsRunning(true);
          applyStreamingText("");
        }

        if (event.type === "agent_text_delta" && "delta" in event) {
          applyStreamingText((prev) => prev + event.delta);
        }

        if (event.type === "agent_title_set") {
          onTitleSetRef.current?.();
        }

        if (event.type === "agent_messages_committed") {
          refreshAfterCommit();
        }

        if (event.type === "agent_finished") {
          refreshAfterCommit();
        }

        if (event.type === "agent_failed") {
          stop();
        }

        lastSeqRef.current = Math.max(lastSeqRef.current, event.runSeq);
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
