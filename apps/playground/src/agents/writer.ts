import { z } from "zod";

import { adl } from "#adl";

import { model } from "../model";
import { conversationTitle } from "./conversation-title";

/**
 * Drafts (and later revises) the article. Plain-text output — the workflow keeps the
 * draft and revision turns in one `memoryScope` so the writer can revise with context.
 */
export const writer = adl.createAgent({
  id: "writer",
  instructions: adl.createTemplate({
    name: "writer-instructions",
    source: [
      "You are a senior technical writer.",
      "You write clear, engaging Markdown articles that follow the given outline.",
      "Prefer concrete examples over vague claims. Keep paragraphs short.",
      "When asked to revise, keep what works and only change what the feedback calls out.",
    ].join("\n"),
    inputData: z.object({}),
  }),
  model,
  titleWorkflow: conversationTitle,
});
