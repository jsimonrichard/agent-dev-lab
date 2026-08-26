import { z } from "zod";

import { adl } from "#adl";

import { outliner, outlineSchema, type Outline } from "../agents/outliner";
import { editor, reviewSchema } from "../agents/editor";
import { writer } from "../agents/writer";
import { articleBriefPrompt, draftRequestPrompt, reviseRequestPrompt } from "../prompts";

function outlineToMarkdown(outline: Outline): string {
  return outline.sections
    .map((section) => {
      const points = section.points.map((point) => `  - ${point}`).join("\n");
      return `- ${section.heading}\n${points}`;
    })
    .join("\n");
}

/**
 * Multi-agent content pipeline: outliner → writer → editor, with a conditional
 * revision pass. Demonstrates structured output, instruction + request templates,
 * per-step `memoryScope`, conditional branching, and custom progress events — all
 * orchestrated in plain TypeScript.
 *
 * Inputs default so the run is launchable from the inspection UI with empty input.
 */
const writeArticleInput = z.object({
  topic: z.string().default("How AI agents are changing software development"),
  audience: z.string().default("software engineers"),
});

export const writeArticle = adl.createWorkflow({
  id: "write-article",
  input: writeArticleInput,
  output: z.object({
    title: z.string(),
    article: z.string(),
    review: reviewSchema,
    revised: z.boolean(),
  }),
  async run(input, ctx) {
    // Re-parse to recover the post-default (required) field types — the workflow
    // input type is the pre-parse shape, where defaulted fields are optional.
    const { topic, audience } = writeArticleInput.parse(input);

    await ctx.setTitle(`Article: ${topic}`);

    const outline = await ctx.step("outline", async ({ ctx: child }) => {
      const handle = outliner.run({
        memoryScope: child.memoryScopeWithSuffix("outline"),
        user: articleBriefPrompt.render({ topic, audience }),
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      });
      const result = await handle.result;
      return outlineSchema.parse(result.output);
    });

    await ctx.setTitle(outline.title);

    ctx.emit({
      type: "custom",
      name: "outline-ready",
      payload: { title: outline.title, sections: outline.sections.length },
    });

    const draftScope = ctx.memoryScopeWithSuffix("draft");

    let article = await ctx.step("draft", async ({ ctx: child }) => {
      const handle = writer.run({
        memoryScope: draftScope,
        user: draftRequestPrompt.render({
          title: outline.title,
          audience,
          outline: outlineToMarkdown(outline),
        }),
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      });
      return (await handle.result).text;
    });

    const review = await ctx.step("review", async ({ ctx: child }) => {
      const handle = editor.run({
        memoryScope: child.memoryScopeWithSuffix("review"),
        user: `Title: ${outline.title}\n\n${article}`,
        workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
      });
      const result = await handle.result;
      return reviewSchema.parse(result.output);
    });

    let revised = false;
    if (review.verdict === "revise" && review.issues.length > 0) {
      revised = true;
      // Same `draftScope` so the writer revises with the original draft in context.
      article = await ctx.step("revise", async ({ ctx: child }) => {
        const handle = writer.run({
          memoryScope: draftScope,
          user: reviseRequestPrompt.render({ issues: review.issues }),
          workflow: { workflowRunId: child.workflowRunId, stepId: child.stepId },
        });
        return (await handle.result).text;
      });
    }

    return { title: outline.title, article, review, revised };
  },
});
