import { adl } from "../adl";

/** Step-only demo workflow for the inspection UI (no LLM). */
export const demoCounter = adl.createWorkflow({
  id: "demo-counter",
  run: async (input: { steps?: number } | null, ctx) => {
    const count = Math.max(1, Math.min(input?.steps ?? 3, 8));
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const value = await ctx.step("accumulate", async () => i + 1, { key: String(i) });
      sum += value;
    }
    return { sum, steps: count };
  },
});
