import type { CoreMessage } from "@agent-dev-lab/core";
import { z } from "zod";

import { adl } from "#adl";

import { researchAssistant } from "../agents/research-assistant";

const MAX_TURNS = 5;

type ContentPart = { type?: unknown };

function isToolCallPart(part: unknown): boolean {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as ContentPart).type === "tool-call"
  );
}

/** Count `tool-call` parts across the assistant messages produced in one episode. */
function countToolCalls(messages: CoreMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      count += message.content.filter(isToolCallPart).length;
    }
  }
  return count;
}

/**
 * Tool-using research workflow. Each `research-assistant` episode is a single AI SDK
 * step, so this workflow drives the tool loop in TypeScript: it re-runs the agent on
 * the same `memoryScope` (which accumulates tool results in the MessageStore) until
 * the model returns a final answer with no further tool calls, or a turn cap is hit.
 *
 * Input defaults so the run is launchable from the inspection UI with empty input.
 */
const answerQuestionInput = z.object({
  question: z.string().default("What is the ADL framework, and what is 128 * 12 + 7?"),
});

export const answerQuestion = adl.createWorkflow({
  id: "answer-question",
  input: answerQuestionInput,
  output: z.object({
    answer: z.string(),
    turns: z.number(),
    toolCalls: z.number(),
  }),
  async run(input, ctx) {
    // Re-parse to recover the post-default (required) field type.
    const { question } = answerQuestionInput.parse(input);
    await ctx.setTitle(question);
    const scope = ctx.memoryScopeWithSuffix("research");
    let answer = "";
    let turns = 0;
    let toolCalls = 0;

    for (let i = 0; i < MAX_TURNS; i++) {
      const turn = await ctx.step(
        "agent-turn",
        async ({ ctx: child }) => {
          const handle = researchAssistant.run({
            memoryScope: scope,
            // First turn poses the question; later turns let the model react to tool
            // results already persisted in the shared memoryScope.
            user: i === 0 ? question : undefined,
            workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
          });
          const result = await handle.result;
          const turnToolCalls = countToolCalls(result.newMessages);
          return { text: result.text, turnToolCalls };
        },
        { key: String(i) },
      );

      turns = i + 1;
      toolCalls += turn.turnToolCalls;

      if (turn.turnToolCalls === 0) {
        answer = turn.text;
        break;
      }
    }

    if (!answer) {
      answer = "(no final answer produced within the turn limit)";
    }

    ctx.emit({ type: "custom", name: "answer-ready", payload: { turns, toolCalls } });
    return { answer, turns, toolCalls };
  },
});
