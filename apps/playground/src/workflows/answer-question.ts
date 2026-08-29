import { countToolCallParts } from "@agent-dev-lab/core";
import { z } from "zod";

import { adl } from "#adl";

import { researchAssistant } from "../agents/research-assistant";

/**
 * Tool-using research workflow. `research-assistant` loops until a request ends
 * with text (`endWhen: "ends-with-text"`). This workflow is one `ctx.step` around
 * that turn; use `endWhen: "api-call-ends"` if you want each model call as its
 * own step.
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

    const turn = await ctx.step("research", async ({ ctx: child }) => {
      const result = await researchAssistant.run({
        memoryScope: scope,
        user: question,
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      }).result;
      return {
        text: result.text,
        turns: result.turns,
        toolCalls: countToolCallParts(result.newMessages),
      };
    });

    const answer = turn.text || "(no final answer produced within the turn limit)";
    ctx.emit({
      type: "custom",
      name: "answer-ready",
      payload: { turns: turn.turns, toolCalls: turn.toolCalls },
    });
    return { answer, turns: turn.turns, toolCalls: turn.toolCalls };
  },
});
