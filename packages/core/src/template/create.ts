import path from "node:path";

import type { z } from "zod";

import { loadPromptFile, resolvePromptPath, shouldRereadPromptFileOnRender } from "./load";
import type { AdlRuntime } from "../runtime/types";
import type { TemplateEngine } from "./engine";
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

function resolveName(config: { name?: string; path?: string }): string {
  if (config.name) {
    return config.name;
  }
  if (config.path) {
    return templateNameFromPath(config.path);
  }
  throw new Error("createTemplate: provide `name` when using inline `source`");
}

/**
 * Build a reusable prompt template (Zod → Handlebars → string).
 * In project code, use {@link AdlRuntime.createTemplate}.
 */
export function buildTemplate<TSchema extends z.ZodType<object>>(
  engine: TemplateEngine,
  config: TemplateConfig<TSchema>,
): Template<z.infer<TSchema>> {
  let source: string;
  let templatePath: string | undefined;
  let filePath: string | undefined;

  if ("source" in config && config.source !== undefined) {
    source = config.source;
  } else if ("path" in config && config.path !== undefined) {
    const from = config.from;
    if (!from) {
      throw new Error(
        "createTemplate({ path, inputData, from: import.meta.url }) — pass `from: import.meta.url` from the defining module",
      );
    }
    templatePath = config.path;
    filePath = resolvePromptPath(from, config.path);
    source = loadPromptFile(filePath);
  } else {
    throw new Error("createTemplate: provide either `path` + `from` or inline `source`");
  }

  const name = resolveName(config);

  return {
    name,
    path: templatePath,
    source,
    demo: config.demo,
    render(inputData: z.infer<TSchema>) {
      const parsed = config.inputData.parse(inputData);
      const text = filePath && shouldRereadPromptFileOnRender() ? loadPromptFile(filePath) : source;
      return engine.render(text, parsed);
    },
  };
}

/** Functional factory for tests and libraries. In project code, use {@link AdlRuntime.createTemplate}. */
export function createTemplate<TSchema extends z.ZodType<object>>(
  runtime: AdlRuntime,
  config: TemplateConfig<TSchema>,
): Template<z.infer<TSchema>> {
  return buildTemplate(runtime.services.templateEngine, config);
}
