import { z } from "zod";

import { adl } from "../adl";

/** Step-only demo workflow for the inspection UI (no LLM). */
export const demoCounter = adl.createWorkflow({
  id: "demo-counter",
  input: z.object({
    steps: z.number().int().min(1).max(8).default(3).describe("Accumulate steps (1–8)."),
  }),
  run: async (input, ctx) => {
    let sum = 0;
    for (let i = 0; i < input.steps; i++) {
      const value = await ctx.step("accumulate", async () => i + 1, { key: String(i) });
      sum += value;
    }
    return { sum, steps: input.steps };
  },
});
