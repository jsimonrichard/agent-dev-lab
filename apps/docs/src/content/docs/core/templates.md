---
title: Templates
description: createTemplate with Zod validation and Handlebars rendering.
---

Templates are TypeScript-first prompts: **Zod-validated data** → **Handlebars** → string. Usable from agents, workflows, tests, or CLI — never tied to `WorkflowContext`.

## createTemplate

```ts
import { z } from "zod";
import { createTemplate } from "@agent-dev-lab/core";

export const findPapersPrompt = createTemplate({
  path: "./prompts/find-papers.md",
  inputData: z.object({
    topic: z.string(),
    maxResults: z.number().int().positive(),
  }),
  demo: {
    topic: "CRISPR delivery",
    maxResults: 10,
  },
});

const text = findPapersPrompt.render({
  topic: "RNA vaccines",
  maxResults: 5,
});
```

### Template name (registry key)

Derived from the template **file name**, not a separate config field:

| `path`                     | `name`        |
| -------------------------- | ------------- |
| `./prompts/find-papers.md` | `find-papers` |
| `./researcher.md`          | `researcher`  |

Basename with extension stripped. Used by `adl.config` listing, `getTemplate("find-papers")`, and future CLI preview.

### Factory behavior

At module load:

1. Resolve `path` relative to the calling module (`from: import.meta.url` when needed).
2. Set **`name`** from filename.
3. Read UTF-8 markdown (no MDX / frontmatter in v1).
4. `Handlebars.compile` once — cached by `TemplateEngine`.

At `render(inputData)`:

1. `inputDataSchema.parse(inputData)` — throw before Handlebars.
2. Run compiled template (`noEscape: true`).
3. Return string.

### API shape

```ts
export interface Template<T> {
  readonly name: string;
  readonly path: string;
  render(inputData: T): string;
  readonly demo?: T;
}
```

Lower-level helpers remain available: `loadPromptFile`, `resolvePromptPath`, `renderPromptTemplate`.

## Config registry

Templates are **not** required in `adl.config` for execution (agents embed templates in `instructions`). For UI/docs listing:

```ts
export default {
  templates: [findPapersPrompt, outlinePrompt],
};
```

`loadAdlProject` indexes by `template.name`; throws on duplicate names.

## Usage patterns

| Site                 | Pattern                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Agent `instructions` | `instructions: findPapersPrompt` — runner renders once at system bootstrap |
| Workflow turn        | `user: outlinePrompt.render({ … })` passed to `agent.run`                  |
| Tests                | `expect(tpl.render({ … })).toMatch(...)`                                   |

No `ctx.render` — pass data explicitly. See [Agents](/core/agents/) and [Workflows](/core/workflows/).

## Template playground (deferred)

Inspection UI page or `adl templates preview <name>` for form-based preview is post-v1. Use `demo` field + unit tests for now.
