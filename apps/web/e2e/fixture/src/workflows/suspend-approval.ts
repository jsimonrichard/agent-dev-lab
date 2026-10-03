import { adl } from "../adl";

/** Parks until the inspector Allow/Deny so e2e can exercise suspend persistence. */
export const suspendApproval = adl.createWorkflow({
  id: "suspend-approval",
  async run(_input, ctx) {
    await ctx.step("before", async () => "before");
    await ctx.requestApproval({ message: "Continue?" });
    await ctx.step("after", async () => "after");
    return { ok: true as const };
  },
});
