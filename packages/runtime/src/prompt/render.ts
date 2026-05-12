import Handlebars from "handlebars";

const handlebars = Handlebars.create();

/**
 * Renders a prompt template with Handlebars ({@link https://handlebarsjs.com/}).
 * Uses `noEscape: true` so values are not HTML-escaped (plain-text prompts).
 */
export function renderPromptTemplate(template: string, context: object): string {
  return handlebars.compile(template, { noEscape: true })(context) as string;
}
