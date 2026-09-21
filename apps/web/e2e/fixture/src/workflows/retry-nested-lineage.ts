import { adl } from "../adl";

/** Leaf nested under `retry-nested-lineage` (listed so Non-Root / API can see it). */
export const retryNestLeaf = adl.createWorkflow({
  id: "retry-nest-leaf",
  async run() {
    return { leaf: true as const };
  },
});

/**
 * Nests a successful child under an ancestor of the retry target so e2e can
 * exercise attempt lineage with nested runs.
 */
export const retryNestedLineage = adl.createWorkflow({
  id: "retry-nested-lineage",
  async run(_input, ctx) {
    await ctx.step("container", async ({ ctx: stepCtx }) => {
      await retryNestLeaf.run({}).result;
      await stepCtx.step("target", async () => "target");
      return { ok: true as const };
    });
    return { ok: true as const };
  },
});
