import Handlebars from "handlebars";

/**
 * Per-runtime Handlebars environment with a compile cache keyed by template source.
 * Owned by {@link RuntimeServices} — one instance per {@link createAdlRuntime} call.
 */
export class TemplateEngine {
  private readonly handlebars = Handlebars.create();
  private readonly compiledBySource = new Map<string, Handlebars.TemplateDelegate>();

  /** Compile `source` once and reuse the compiled delegate on subsequent calls. */
  compile(source: string): Handlebars.TemplateDelegate {
    let compiled = this.compiledBySource.get(source);
    if (!compiled) {
      compiled = this.handlebars.compile(source, { noEscape: true });
      this.compiledBySource.set(source, compiled);
    }
    return compiled;
  }

  /** Render a template string with Handlebars (`noEscape: true` for plain-text prompts). */
  render(source: string, context: object): string {
    return this.compile(source)(context) as string;
  }
}
