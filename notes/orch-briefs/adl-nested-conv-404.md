## Goal

Triage nested-workflow conversation 404s in the inspection UI: determine whether links from the workflow run page are wrong, the conversation lookup misses nested scopes, or both — then fix the real bug without papering over bad URLs.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Reproduce from a nested playground workflow (e.g. nested-demo / copy-memory) that exposes conversation links.
2. Trace route + API: conversation id / memoryScope used in the link vs store keys after own-`workflowRunId` nesting.
3. Fix either link generation, lookup, or both — one coherent path.
4. Add a regression (unit or Playwright) that would have caught the 404.
5. Update roadmap row status when done.

## Out of scope

- Nested-run context API (Lane B) unless the fix truly requires `parentWorkflowRunId` on ctx (prefer fixing host lookup first).
- Retry / execution-control redesign.
- Unrelated inspector polish (Lane I).

## Success criteria

1. Root cause named (link vs lookup vs data missing) in the PR/handoff.
2. Previously 404-ing nested conversation navigations resolve or show a deliberate empty state with correct id — not a false 404.
3. Regression coverage added.
4. `.claude/gate.sh full` green (include `test:e2e` if the regression is Playwright).

## Constraints

- Triage before fixing display-only symptoms.
- Do not special-case a single playground workflow id in the host.

## Handoff notes

Parent plan lane map F. Roadmap §4 nested-workflow conversations 404. Browser session on integrator task previously had nested run URLs — useful reproduction hint.
