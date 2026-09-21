import { adl } from "../adl";

/**
 * Stays live for a few seconds so e2e can assert Retry is gated while running,
 * then settles so Retry becomes available.
 */
export const hangForRetry = adl.createWorkflow({
  id: "hang-for-retry",
  async run(_input, ctx) {
    await ctx.step("before", async () => "before");
    await ctx.step("hang", async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 3_000);
      });
      return "done";
    });
    return { ok: true as const };
  },
});
