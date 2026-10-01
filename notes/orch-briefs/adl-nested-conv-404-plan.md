# Plan: Nested-workflow conversation 404 (Lane F)

## Goal

Triage and fix inspection-UI 404s when opening conversations linked from (nested) workflow runs: name whether the bug is bad link generation, session/lookup miss, or missing data — then fix one coherent path and add a regression.

## Principles

- Fail closed — no silent fallbacks; false 404 is worse than a deliberate empty state with the correct id.
- Upstream before workaround — prefer TanStack Router / existing session hydration over ad-hoc decode hacks.
- Generalize — one path for all `memoryScope` values (including `runId:suffix`); no playground-id branches.
- One concern — triage → fix → regression → roadmap status.
- Plan first (this file).
- State gaps.

## Reuse survey

| Existing piece                                                                                  | Role                                                                  | Extend?                                          |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/web/src/components/app/step-inspector-panel.tsx`                                          | Builds `/agent/$agentId/run/$runId` with `runId: episode.memoryScope` | Kept; links were correct                         |
| `apps/web/src/routes/_app/agent/$agentId/run/$runId.tsx`                                        | Loader → `fetchAgentConversation` → `notFound()`                      | Unchanged                                        |
| `apps/web/src/lib/run-service.server.ts` (`resolveAgentConversation`, `ensureSessionsHydrated`) | Session gate for 404                                                  | **Fixed** — once-async hydrate + episode rebuild |
| `apps/web/src/lib/agent/agent-sessions.ts`                                                      | In-memory `byMemoryScope`                                             | Extended with `registerAgentSessionFromEpisode`  |
| `apps/web/src/lib/once-async.ts`                                                                | Shared once-async latch                                               | **Added**                                        |
| `apps/web/src/lib/agent/agent-location.ts`                                                      | Sidebar path parse                                                    | Decode `%3A` scopes                              |

## Numbered work

1. **Reproduce / triage** — Link generation uses `episode.memoryScope`; MessageStore keys match. False 404 = session map miss.
2. **Root cause** — `ensureSessionsHydrated` set `sessionsHydrated = true` before awaiting `listAgentEpisodes()`. Concurrent loaders returned early; workflow-linked colon scopes are episode-only (often absent from conversation metadata) → 404.
3. **Fix** — `createOnceAsync` hydration; `resolveSessionForMemoryScope` rebuilds from episodes when still missing.
4. **Regression** — `once-async.test.ts`, colon-scope session + `parseAgentLocation` tests.
5. **Roadmap** — §4 row marked done.

## Out of scope

- Nested-run context API / `parentWorkflowRunId` on ctx (Lane B).
- Retry / Shepherd execution control.
- Inspector polish (Lane I).
- Cross-phase memory-scope product decision (nested-run-followups §2).

## Success criteria

1. Root cause named: **lookup miss** (hydration race), not bad links or missing MessageStore data.
2. Conversation navigations for `${workflowRunId}:suffix` resolve after cold start.
3. Regression coverage added (unit).
4. `.claude/gate.sh full` green.

## Status

- **Done (2026-10-01)** — fix landed; Playwright e2e for workflow→conversation click deferred (fixture has no colon-scope agent workflow yet).
