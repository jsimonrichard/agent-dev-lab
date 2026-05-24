import type { z } from "zod";

/** Branded prompt template: Zod-validated input → Handlebars → string. */
export interface Template<TInput> {
  readonly name: string;
  readonly path: string;
  readonly demo?: TInput;
  render(inputData: TInput): string;
}

export type TemplateConfig<TSchema extends z.ZodType> = {
  path: string;
  /** Defaults to the caller module URL when omitted. */
  from?: string;
  inputData: TSchema;
  demo?: z.infer<TSchema>;
};
