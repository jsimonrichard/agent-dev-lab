## Goal

Add a structured JSON editor to the inspection UI that matches the look of the existing read-only JsonDocument tree, so users can add and remove array items and object keys in tool-context / workflow-input `kind: "json"` fields without hand-editing brackets.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. **JsonEditor component** in `apps/web` that mirrors `JsonDocument` layout (`ArrayFields` / `ArrayItem` / `Field` / empty `[]`/`{}` markers, mono indices). Controlled `JsonValue` + `onChange`. Arrays: add/remove rows and choose new-item type (string / number / boolean / object / array). Objects: add/remove/rename keys; nested editors recursively. Primitives: inline inputs in the same row chrome as the display. Depth cap consistent with `JsonDocument`; deeper subtrees fall back to a raw textarea for that node.
2. **Raw escape hatch** (document vs raw), same idea as `JsonPreview`'s document/json tabs. Invalid raw paste fails closed (inline error; do not silently coerce).
3. **Wire forms:** `SchemaFieldControl` for `kind: "json"`, and the raw tool-context JSON path on agent settings / definition pages. String form values still serialize via existing build/parse helpers.
4. **Tests + patch changeset** for `@agent-dev-lab/web` (unit tests for immutable edit helpers and round-trip).

## Out of scope

- Playwright / browser e2e (Lane B).
- Schema-aware typed lists that bypass `kind: "json"` (no change to Zod walk to invent new field kinds).
- Editing read-only `JsonPreview` / `JsonDocument` surfaces.
- CLI, core, or tools package changes.
- Landing work in the reporter task `taba0001f`.

## Success criteria

1. On a ToolProvider agent whose `contextSchema` yields `kind: "json"` array fields (e.g. playground `sandbox-agent` allowlists), items can be added and removed via UI controls without typing JSON.
2. Editor chrome is recognizably the same family as `JsonDocument` (mono indices, nested indent, empty markers).
3. Raw mode accepts valid JSON and round-trips into the tree; invalid JSON shows an error and does not invent a value.
4. `.claude/gate.sh full` green after the change.

## Constraints

- Do not overload read-only `JsonDocument` with edit props — new component (and small lib helpers) that reuse layout/token patterns.
- Hosts must not branch on ToolProvider identity; one form path through `SchemaFieldControl`.
- This lane does not hold the schema lock for unrelated modules.
- Do not `--switch` the reporter off `taba0001f`.

## Handoff notes

Reporter lane: `taba0001f`. Sibling lane owns Playwright chat streaming.

Reuse survey (verify in checkout):

- `apps/web/src/components/app/json-document.tsx` — display tree to mirror
- `apps/web/src/components/app/json-preview.tsx` — document/raw tab pattern
- `apps/web/src/components/app/schema-field-control.tsx` — `kind: "json"` textarea today
- `apps/web/src/components/app/agent-settings-panel.tsx` — tool-context form
- `apps/web/src/lib/json-document.ts` — `isPlainObject`, clipboard helpers
- `apps/web/src/lib/workflow/workflow-input-schema.ts` — arrays already become `kind: "json"`
