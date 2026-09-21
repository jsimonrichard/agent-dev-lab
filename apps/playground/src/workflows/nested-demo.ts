import { z } from "zod";

import { adl } from "#adl";

import { demoCounter } from "./demo-counter";

const leafInput = z.object({
  label: z.string().describe("Echoed in the leaf output so nested runs are easy to tell apart."),
});

/** Leaf workflow — its own run row when nested. */
export const nestLeafAlpha = adl.createWorkflow({
  id: "nest-leaf-alpha",
  inputSchema: leafInput,
  async run(input, ctx) {
    if (ctx.stepId === null) {
      await ctx.setTitle(`Leaf α: ${input.label}`);
    }
    return { leaf: "alpha" as const, label: input.label };
  },
});

/** Leaf workflow — distinct id from alpha for the Non-Root list. */
export const nestLeafBeta = adl.createWorkflow({
  id: "nest-leaf-beta",
  inputSchema: leafInput,
  async run(input, ctx) {
    if (ctx.stepId === null) {
      await ctx.setTitle(`Leaf β: ${input.label}`);
    }
    return { leaf: "beta" as const, label: input.label };
  },
});

const phaseInput = z.object({
  label: z.string(),
});

/**
 * Mid-level sub-workflow: nests leaf workflows via `workflow.run()` (not `ctx.step`).
 * Registered so it shows up under Non-Root and as a parent of the leaves.
 */
export const nestPhase = adl.createWorkflow({
  id: "nest-phase",
  inputSchema: phaseInput,
  outputSchema: z.object({
    alpha: z.object({ leaf: z.literal("alpha"), label: z.string() }),
    beta: z.object({ leaf: z.literal("beta"), label: z.string() }),
  }),
  async run(input, ctx) {
    if (ctx.stepId === null) {
      await ctx.setTitle(`Phase: ${input.label}`);
    }
    // Plain nested workflow runs — ALS links parentWorkflowRunId to this phase.
    const alpha = await nestLeafAlpha.run({ label: `${input.label}/α` }).result;
    const beta = await nestLeafBeta.run({ label: `${input.label}/β` }).result;
    return { alpha, beta };
  },
});

const nestedDemoInput = z.object({
  label: z.string().default("playground").describe("Label passed through the nested tree."),
  steps: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(2)
    .describe("Steps for the nested demo-counter call."),
});

/**
 * Top-level demo: nests `nest-phase` (which nests leaves) and `demo-counter`.
 * Use Non-Root + parent/child links on the run page to walk the tree.
 */
export const nestedDemo = adl.createWorkflow({
  id: "nested-demo",
  inputSchema: nestedDemoInput,
  outputSchema: z.object({
    phase: z.object({
      alpha: z.object({ leaf: z.literal("alpha"), label: z.string() }),
      beta: z.object({ leaf: z.literal("beta"), label: z.string() }),
    }),
    counter: z.object({ sum: z.number(), steps: z.number() }),
  }),
  async run(input, ctx) {
    const { label, steps } = nestedDemoInput.parse(input);
    if (ctx.stepId === null) {
      await ctx.setTitle(`Nested demo: ${label}`);
    }

    const phase = await nestPhase.run({ label }).result;
    const counter = await demoCounter.run({ steps }).result;

    return { phase, counter };
  },
});
