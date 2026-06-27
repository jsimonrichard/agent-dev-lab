import type { z } from "zod";

/**
 * Branded prompt template: Zod-validated input, then Handlebars, then string.
 *
 * Usable from agent `instructions`, workflow turns, or tests — not tied to
 * {@link WorkflowContext}. Pass render data explicitly (no `ctx.render`).
 *
 * When created from a file path, `name` is the filename basename without extension
 * (e.g. `./prompts/find-papers.md` → `"find-papers"`). Create via `adl.createTemplate`
 * and list in `adl.config` `templates[]`.
 *
 * @see {@link createTemplate}
 */
export interface Template<TInput> {
  readonly name: string;
  readonly path?: string;
  readonly source: string;
  readonly demo?: TInput;
  render(inputData: TInput): string;
}

type TemplateConfigBase<TSchema extends z.ZodType> = {
  inputData: TSchema;
  demo?: z.infer<TSchema>;
  name?: string;
};

export type TemplateFromPathConfig<TSchema extends z.ZodType> = TemplateConfigBase<TSchema> & {
  path: string;
  from?: string;
  source?: never;
};

export type TemplateFromSourceConfig<TSchema extends z.ZodType> = TemplateConfigBase<TSchema> & {
  source: string;
  path?: never;
  from?: never;
};

export type TemplateConfig<TSchema extends z.ZodType> =
  | TemplateFromPathConfig<TSchema>
  | TemplateFromSourceConfig<TSchema>;
