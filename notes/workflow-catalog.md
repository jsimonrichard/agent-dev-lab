# Workflow catalog organization (deferred)

**Status:** Keep the v1 model. Nesting will produce many registered workflows; the inspection UI and CLI will eventually need a way to filter and group them. **No API or UI change yet.** Folders, tags, and/or ID namespacing are all still on the table.

Related: [project config](../apps/docs/src/content/docs/core/project.md), [workflows](../apps/docs/src/content/docs/core/workflows.md), [project setup](../apps/docs/src/content/docs/guides/project-setup.md), inspection sidebar (`apps/web/src/components/app/workflow-runs-sidebar.tsx`).

---

## Current model (keep)

`adl.createWorkflow` does **not** register a workflow on the runtime. It binds a `Workflow` object to stores and observers. Discovery is the **static project registry**:

```ts
// adl.config.ts
export default {
  name: "playground",
  adl,
  workflows: [demoCounter, writeArticle, answerQuestion, literatureReview],
};
```

`loadAdlProject` indexes that array by `id` (duplicate ids throw). The inspection sidebar, `adl workflow list`, and `adl workflow run <id>` all read this list. IDs are opaque slugs; routes are `/workflows/$workflowId` and `/workflows/$workflowId/run/$runId` (one path segment).

Nested workflows are ordinary TypeScript imports: `otherWorkflow.run(...)` inherits the parent `WorkflowContext` via ALS and shares `workflowRunId`. Helpers **do not** need to be in `workflows: []` to be callable. They appear in the UI list only when they are also registered.

Until a catalog feature exists, the intended pattern is: **register entry workflows**; keep compose-only helpers as imported modules.

Agents have the same flat `agents: []` list; any catalog feature should consider both.

---

## Why this will matter

Nesting is a documented composition primitive. As projects grow, authors will want helpers in the registry too (start them from the UI, `adl workflow run`, inspect input schemas). A flat list then mixes entry points with library modules.

That is a **catalog** problem (how definitions are browsed). It is separate from the **call graph** (how a run nests), which the waterfall already shows.

---

## Future options (not decided)

These can be combined. None is committed.

### Folders (display grouping)

Optional metadata on the definition, e.g. `folder: "literature"` or `"experiments/crispr"`. The sidebar becomes a tree; `id` stays a unique slug. Can mirror `workflows/literature/search-papers.ts` as a convention without globbing the filesystem.

Does not change `getWorkflow(id)`, CLI args, or current single-segment routes.

### Tags (filter)

Optional `tags: string[]` for faceting (experiment, internal, paper name) without implying a single tree. Complements folders; a workflow can have several tags and one folder.

### ID namespacing

Hierarchical identity on `id` itself, e.g. `literature-review/search-papers` or `literature.search-papers`. Unique ids stay global; the slash (or other separator) is part of the slug.

**Current URL code assumes one segment** (`parseWorkflowLocation`, `/workflows/$workflowId`). That is an implementation detail, not a reason to reject namespaced ids. Future routing can:

- **Encode** the id in a single segment (`encodeURIComponent`), or
- Use a **multi-segment / catch-all** route (`/workflows/$` or `/workflows/literature-review/search-papers`).

CLI would pass the full id (`adl workflow run literature-review/search-papers`). `getWorkflow` already keys on the whole string.

Open design questions if namespacing is chosen:

- Reuse: a helper used by two parents does not have a single natural prefix.
- Separator and validation (`/`, `.`, Unicode).
- Whether the namespace is author-chosen metadata or derived from folders/files.
- Whether agents get the same scheme.

---

## Non-goals for now

- Auto-scanning `workflows/**/*.ts` — contradicts static registry at load time ([project config](../apps/docs/src/content/docs/core/project.md#why-registries-stay-static)).
- Making registry hierarchy match the nested call graph — nesting is dynamic (`if` / loops) and a child can be reused.

---

## v1

- [x] Flat `workflows: []` / `agents: []` indexed by unique `id`
- [x] Nested `workflow.run` without registry membership
- [ ] Folder / tag / namespaced-id catalog — deferred
