import type { z } from "zod";

/** Branded prompt template: Zod-validated input → Handlebars → string. */
export interface Template<TInput> {
  /** Registry / CLI name. */
  readonly name: string;
  /** Set when loaded from a file; omitted for inline `source` templates. */
  readonly path?: string;
  /** Markdown / Handlebars source (always available). */
  readonly source: string;
  readonly demo?: TInput;
  render(inputData: TInput): string;
}

type TemplateConfigBase<TSchema extends z.ZodType> = {
  inputData: TSchema;
  demo?: z.infer<TSchema>;
  /** Registry name when it cannot be derived from `path` (inline / raw import). */
  name?: string;
};

/** Load template text from a file relative to `from` (usually `import.meta.url`). */
export type TemplateFromPathConfig<TSchema extends z.ZodType> = TemplateConfigBase<TSchema> & {
  path: string;
  from?: string;
  source?: never;
};

/** Inline template body (string or ESM `?raw` import). */
export type TemplateFromSourceConfig<TSchema extends z.ZodType> = TemplateConfigBase<TSchema> & {
  source: string;
  path?: never;
  from?: never;
};

export type TemplateConfig<TSchema extends z.ZodType> =
  | TemplateFromPathConfig<TSchema>
  | TemplateFromSourceConfig<TSchema>;
