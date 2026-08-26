import { z } from "zod";

import { adl } from "#adl";

import { model } from "../model";
import { outlinerSystemPrompt } from "../prompts";
import { conversationTitle } from "./conversation-title";

export const outlineSchema = z.object({
  title: z.string().describe("A specific, compelling article title."),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        points: z.array(z.string()),
      }),
    )
    .describe("3-5 sections, each with 2-4 talking points."),
});

export type Outline = z.infer<typeof outlineSchema>;

/**
 * Plans an article outline. Uses a file-based system prompt template and structured
 * output so the workflow receives typed `{ title, sections }`.
 */
export const outliner = adl.createAgent({
  id: "outliner",
  systemPrompt: outlinerSystemPrompt,
  model,
  outputSchema: outlineSchema,
  titleWorkflow: conversationTitle,
});
