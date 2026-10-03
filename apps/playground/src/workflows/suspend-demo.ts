import { adl } from "../adl";

/**
 * Parks at `ctx.requestApproval` until the inspector Allow/Deny (SuspendStore).
 */
export const suspendDemo = adl.createWorkflow({
  id: "suspend-demo",
  run: async (_input, ctx) => {
    const before = await ctx.step("before", async () => "ready");
    await ctx.requestApproval({ message: "Continue the run?" });
    const after = await ctx.step("after", async () => "resumed");
    return { before, after };
  },
});
