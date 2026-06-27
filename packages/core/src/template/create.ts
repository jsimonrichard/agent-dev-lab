import path from "node:path";

import type { z } from "zod";

import { loadPromptFile, resolvePromptPath } from "../prompt/load";
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

/** Functional factory: template config plus explicit {@link AdlRuntime}. */
export type CreateTemplateParams<TSchema extends z.ZodType> = TemplateConfig<TSchema> & {
  runtime: AdlRuntime;
};

/**
 * Build a reusable prompt template (Zod → Handlebars → string) using a runtime-owned engine.
 */
export function buildTemplate<TSchema extends z.ZodType>(
  engine: TemplateEngine,
  config: TemplateConfig<TSchema>,
): Template<z.infer<TSchema>> {
  let source: string;
  let templatePath: string | undefined;

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
    source = loadPromptFile(resolvePromptPath(from, config.path));
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
      return engine.render(source, parsed);
    },
  };
}

/** Functional factory — prefer {@link AdlRuntime.createTemplate} in project code. */
export function createTemplate<TSchema extends z.ZodType>(
  params: CreateTemplateParams<TSchema>,
): Template<z.infer<TSchema>> {
  const { runtime, ...config } = params;
  return buildTemplate(runtime.services.templateEngine, config);
}
