import path from "node:path";

import type { z } from "zod";

import { loadPromptFile, resolvePromptPath } from "../prompt/load";
import { renderPromptTemplate } from "../prompt/render";
import type { Template, TemplateConfig } from "./types";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

function templateNameFromPath(filePath: string): string {
  const base = path.basename(filePath);
  for (const ext of MARKDOWN_EXTENSIONS) {
    if (base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
  }
  return base;
}

/**
 * Create a reusable prompt template (Zod → Handlebars → string).
 * Compiles the markdown file once at factory time.
 */
export function createTemplate<TSchema extends z.ZodType>(
  config: TemplateConfig<TSchema>,
): Template<z.infer<TSchema>> {
  const from = config.from;
  if (!from) {
    throw new Error(
      "createTemplate({ path, inputData, from: import.meta.url }) — pass `from: import.meta.url` from the defining module",
    );
  }

  const absolutePath = resolvePromptPath(from, config.path);
  const source = loadPromptFile(absolutePath);
  const name = templateNameFromPath(config.path);

  return {
    name,
    path: config.path,
    demo: config.demo,
    render(inputData: z.infer<TSchema>) {
      const parsed = config.inputData.parse(inputData);
      return renderPromptTemplate(source, parsed);
    },
  };
}
