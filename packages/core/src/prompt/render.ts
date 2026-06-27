import type { TemplateEngine } from "../template/engine.js";

/**
 * Renders a prompt template with Handlebars ({@link https://handlebarsjs.com/}).
 * Uses `noEscape: true` so values are not HTML-escaped (plain-text prompts).
 *
 * Prefer {@link AdlRuntime.createTemplate} for project templates; use this for ad-hoc
 * rendering with a runtime-owned {@link TemplateEngine}.
 */
export function renderPromptTemplate(
  engine: TemplateEngine,
  template: string,
  context: object,
): string {
  return engine.render(template, context);
}
