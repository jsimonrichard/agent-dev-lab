import { adl } from "../adl";

/**
 * Multi-step workflow for attempt-lineage Retry e2e.
 * Completes successfully so the inspector can retry from a chosen step.
 */
export const retryLineage = adl.createWorkflow({
  id: "retry-lineage",
  async run(_input, ctx) {
    await ctx.step("a", async () => "A");
    await ctx.step("b", async () => "B");
    await ctx.step("c", async () => "C");
    return { ok: true as const };
  },
});
