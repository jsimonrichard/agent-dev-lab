import { z } from "zod";

import { adl } from "#adl";

/**
 * Prompt templates (Zod-validated → Handlebars → string). Instruction templates are
 * variable-free system prompts; request templates carry per-run variables and are
 * rendered into `user` messages inside workflows.
 *
 * Registered in `adl.config.ts` `templates[]` so they show up in tooling. The registry
 * key is `template.name` (the filename basename for file templates, or the explicit
 * `name` for inline templates).
 */

/** System prompt for the outliner agent, loaded from `./outliner.md`. */
export const outlinerInstructions = adl.createTemplate({
  path: "./outliner.md",
  from: import.meta.url,
  inputData: z.object({}),
});

/** User message asking the outliner to plan an article. */
export const articleBriefPrompt = adl.createTemplate({
  name: "article-brief",
  source: [
    "Plan an article about: {{topic}}",
    "Target audience: {{audience}}",
    "",
    "Return a title and a structured section outline.",
  ].join("\n"),
  inputData: z.object({ topic: z.string(), audience: z.string() }),
  demo: { topic: "How AI agents change software development", audience: "software engineers" },
});

/** User message asking the writer to draft an article from an approved outline. */
export const draftRequestPrompt = adl.createTemplate({
  name: "draft-request",
  source: [
    "Write the full article in Markdown for the following outline.",
    "Audience: {{audience}}",
    "",
    "Title: {{title}}",
    "",
    "Outline:",
    "{{outline}}",
    "",
    "Write a tight, engaging article. Use the section headings from the outline.",
  ].join("\n"),
  inputData: z.object({ title: z.string(), audience: z.string(), outline: z.string() }),
});

/** User message asking the writer to revise a draft using editor feedback. */
export const reviseRequestPrompt = adl.createTemplate({
  name: "revise-request",
  source: [
    "Revise the previous draft to address this editorial feedback:",
    "{{#each issues}}- {{this}}\n{{/each}}",
    "",
    "Return the full revised article in Markdown.",
  ].join("\n"),
  inputData: z.object({ issues: z.array(z.string()) }),
});

export const promptTemplates = [
  outlinerInstructions,
  articleBriefPrompt,
  draftRequestPrompt,
  reviseRequestPrompt,
];
