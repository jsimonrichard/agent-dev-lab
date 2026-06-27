import { z } from "zod";

import { adl } from "#adl";

import { model } from "../model";

export const reviewSchema = z.object({
  score: z.number().min(0).max(10).describe("Overall quality from 0-10."),
  verdict: z.enum(["ship", "revise"]).describe("Whether the draft is ready to ship."),
  strengths: z.array(z.string()),
  issues: z.array(z.string()).describe("Concrete, actionable problems to fix."),
});

export type Review = z.infer<typeof reviewSchema>;

/**
 * Reviews a draft and returns structured feedback. The workflow branches on
 * `verdict` to decide whether a revision pass is needed.
 */
export const editor = adl.createAgent({
  id: "editor",
  instructions:
    "You are a meticulous editor. Critique the draft for clarity, accuracy, and structure. " +
    "Be specific and fair. Return a score, a verdict, concrete strengths, and concrete issues.",
  model,
  outputSchema: reviewSchema,
});
