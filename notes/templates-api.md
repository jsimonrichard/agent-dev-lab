# Templates API (draft)

TypeScript-first prompt templates: **Zod-validated data** → **Handlebars** → string. Usable from agents, workflows, tests, or CLI—never tied to `WorkflowContext`.

**Status:** Partial today (`loadPromptFile`, `renderPromptTemplate` only). **`createTemplate`** not implemented.

Related: [`agent-api.md`](./agent-api.md), [`workflow-api.md`](./workflow-api.md), [`project-api.md`](./project-api.md).

---

## Naming: `createTemplate`

Align with **`createAgent`**, **`createWorkflow`** — `create*` leaves room for init work (read file, compile Handlebars once) at factory time.

```ts
import { z } from "zod";
import { createTemplate } from "@agent-dev-lab/runtime";

export const findPapersPrompt = createTemplate({
  path: "./prompts/find-papers.md", // registry name: "find-papers" (filename without extension)
  data: z.object({
    topic: z.string(),
    maxResults: z.number().int().positive(),
  }),
  /** Optional — for docs / future template playground */
  demo: {
    topic: "CRISPR delivery",
    maxResults: 10,
  },
});

// Anywhere (workflow step, test, agent runner):
const text = findPapersPrompt.render({
  topic: "RNA vaccines",
  maxResults: 5,
}); // Zod parse → Handlebars (noEscape) → string
```

### Factory behavior (`createTemplate`)

At call time (module load):

1. Resolve `path` relative to **`import.meta.url`** of the calling module (or explicit `from: import.meta.url`).
2. Read UTF-8 markdown (no MDX / frontmatter v1).
3. `Handlebars.compile(template, { noEscape: true })` once — reuse on every `render`.

At `render(data)`:

1. **`dataSchema.parse(data)`** (Zod) — throw with clear error before touching Handlebars.
2. Run compiled template with parsed object.
3. Return string.

### API shape (sketch)

```ts
export function createTemplate<T extends z.ZodType>(config: {
  id?: string;
  path: string;
  from?: string; // import.meta.url of caller
  data: T;
  demo?: z.infer<T>;
}): Template<z.infer<T>>;

export interface Template<T> {
  readonly id?: string;
  render(data: T): string;
  /** Parsed demo data for playground / tests */
  readonly demo?: T;
}
```

Sugar: `createTemplate.fromFile("./foo.md", z.object({...}))` if we want a shorter overload later.

---

## Config registry (optional)

Templates are **not** required in `adl.config` for execution (agents embed `createTemplate` results in `instructions` or workflows call `.render()` directly).

Optional listing for UI/docs:

```ts
templates: [findPapersPrompt, outlinePrompt], // if each has `id`
// or Record for now — TBD; workflows/agents use arrays, templates less critical
```

Prefer **array + `id`** on `createTemplate` when we add registry parity.

---

## Agent / workflow usage

| Site | Pattern |
|------|---------|
| Agent `instructions` | `instructions: findPapersPrompt` or `createTemplate` ref; runner renders once at system bootstrap |
| Workflow turn | `user: outlinePrompt.render({ ... })` passed to `agent.run` |
| Tests | `expect(tpl.render({ ... })).toMatch(...)` |

No `ctx.render` — pass data explicitly ([`workflow-api.md`](./workflow-api.md)).

---

## Template playground UI (low priority)

**Idea:** inspection UI page or `adl templates preview <id>` that:

- Loads template from project config (or path arg)
- Pre-fills form from Zod schema (via `zod-to-json-schema` or hand-written demo only)
- Shows rendered markdown side-by-side

**Default demo data:** `demo` field on `createTemplate` config.

**Priority:** post-v1. Valuable for non-dev collaborators and prompt review; not blocking headless runtime. Could start as dev-only route in `apps/web`.

**v1 alternative:** unit tests + `demo` in Starlight docs examples.

---

## v1 checklist

- [ ] `createTemplate({ path, data, demo? })` + `name` from filename + `Template.render`
- [ ] `templates: []` in config + `getTemplate(name)` / `listTemplateNames()`
- [ ] Zod validation before Handlebars
- [ ] `from` / `import.meta.url` resolution (same as `resolvePromptPath`)
- [ ] Wire agent runner: `instructions` as `Template` or string
- [ ] Defer template playground UI
