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
  inputData: z.object({
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

### Template `name` (registry key)

Derived from the template **file name**, not a separate config field:

| `path`                     | `name`        |
| -------------------------- | ------------- |
| `./prompts/find-papers.md` | `find-papers` |
| `./researcher.md`          | `researcher`  |

Rule: basename of `path` with extension stripped (`.md`, `.markdown`, etc.). Exposed as **`template.name`** (readonly). Used by `adl.config` listing, `getTemplate("find-papers")`, and `adl templates preview find-papers` (future).

**v1:** no explicit `id` on `createTemplate` — rename the file if you need a different registry name. Two templates in different folders with the same basename would collide at load time (error).

### Factory behavior (`createTemplate`)

At call time (module load):

1. Resolve `path` relative to **`import.meta.url`** of the calling module (or explicit `from: import.meta.url`).
2. Set **`name`** from filename (see above).
3. Read UTF-8 markdown (no MDX / frontmatter v1).
4. `Handlebars.compile(template, { noEscape: true })` once — reuse on every `render`.

At `render(inputData)`:

1. **`inputDataSchema.parse(inputData)`** (Zod) — throw with clear error before touching Handlebars.
2. Run compiled template with parsed object.
3. Return string.

### API shape (sketch)

```ts
export function createTemplate<T extends z.ZodType>(config: {
  path: string;
  from?: string; // import.meta.url of caller
  inputData: T;
  demo?: z.infer<T>;
}): Template<z.infer<T>>;

export interface Template<T> {
  /** Basename of `path` without extension — registry / CLI name */
  readonly name: string;
  readonly path: string;
  render(inputData: T): string;
  readonly demo?: T;
}
```

Sugar: `createTemplate.fromFile("./foo.md", z.object({...}))` if we want a shorter overload later.

---

## Config registry (list, like workflows / agents)

Templates are **not** required in `adl.config` for execution (agents embed templates in `instructions` or call `.render()` inline). For UI/docs/CLI listing, use an **array** — same pattern as workflows and agents:

```ts
// adl.config.ts
import { findPapersPrompt, outlinePrompt } from "./src/prompts";

export default {
  templates: [findPapersPrompt, outlinePrompt],
  // lookup: getTemplate("find-papers") — name from find-papers.md
};
```

`loadAdlProject` builds an index by **`template.name`** (filename); throws on duplicate names across the array.

---

## Agent / workflow usage

| Site                 | Pattern                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Agent `instructions` | `instructions: findPapersPrompt` or `createTemplate` ref; runner renders once at system bootstrap |
| Workflow turn        | `user: outlinePrompt.render({ ... })` passed to `agent.run`                                       |
| Tests                | `expect(tpl.render({ ... })).toMatch(...)`                                                        |

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

- [ ] `createTemplate({ path, inputData, demo? })` + `name` from filename + `Template.render`
- [ ] `templates: []` in config + `getTemplate(name)` / `listTemplateNames()`
- [ ] Zod validation before Handlebars
- [ ] `from` / `import.meta.url` resolution (same as `resolvePromptPath`)
- [ ] Wire agent runner: `instructions` as `Template` or string
- [ ] Defer template playground UI
