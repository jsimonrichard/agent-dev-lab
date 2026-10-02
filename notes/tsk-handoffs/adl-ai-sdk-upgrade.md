# HANDOFF — adl-ai-sdk-upgrade

## Goal

Upgrade the monorepo from Vercel AI SDK **v5** (`ai@^5.0.86`) to **v7** (latest `ai@7.x`), staging through v6. Publish breaking changesets. See `notes/ai-sdk-upgrade.md`.

## Principles

- Fail closed; upstream before workaround (codemods first); one concern; plan first; state gaps.
- **One supported `ai` major** on published packages — no `^5 \|\| ^7` peer dual-support in this fork.
- **`ai` is a peer of `@agent-dev-lab/core`, not a bundled/hard dependency.** Hosts install `ai`; core `dist/` must not inline it.

## Scope

1. Inventory `ai` / `@ai-sdk/*` / `ai/test` imports; map to v6/v7 migration guides.
2. Move `ai` from core `dependencies` → `peerDependencies` (+ `devDependencies` for this monorepo); verify tsdown keeps `ai` external; update scaffold/playground/docs so hosts declare `ai`.
3. Bump to AI SDK 6 + matching `@ai-sdk/*`; run `@ai-sdk/codemod v6`; fix compile/tests.
4. Bump to AI SDK 7 + matching providers/MCP; run `@ai-sdk/codemod v7`; fix compile/tests.
5. Update hotspots: drop/replace `CoreMessage` re-export; `experimental_telemetry` → v7 telemetry/`@ai-sdk/otel`; `system` → `instructions` in `AgentImpl`; packageDocumentation; tracing note.
6. Bump playground + CLI scaffold `@ai-sdk/openai` (and tools `@ai-sdk/mcp`) to v7-aligned versions — derive minors at implement time from npm.
7. Changesets (breaking) for touched publishable packages — call out **peer move** and major bump; update `notes/near-term-roadmap.md` / shrink `notes/ai-sdk-upgrade.md` when done.

## Out of scope

- Dual-major peer ranges.
- Shipping a nested copy of `ai` inside `@agent-dev-lab/core` for convenience.
- Adopting SDK `ToolLoopAgent` as ADL’s agent.
- Execution-control spine (cursor retry / suspend / debugger).
- Product features that only become possible on v7 (land separately after green).

## Success criteria

1. Core: `ai` in `peerDependencies` (and monorepo `devDependencies`) only — **not** in `dependencies`; imports remain external in `dist/`.
2. Hosts that run agents declare `ai@^7` (or repo pin); typecheck/tests green under Bun and `bun run test:node` where applicable.
3. MCP provider works against the bumped `@ai-sdk/mcp`.
4. No first-party use of APIs removed in v6/v7; docs say AI SDK v7 and document peer install.
5. `.claude/gate.sh full` green.
6. Breaking changeset(s) with consumer migration notes (peer + major).

## Constraints

- Prefer codemod + upstream names over long-lived ADL compatibility shims.
- Node `>=22` already matches AI SDK 7 — do not lower engines.
- Derive version numbers at fork time; do not copy stale minors from this HANDOFF.
- Do not re-add `ai` as a production dependency of core to “make install quieter.”

## Handoff notes

Parent: integrator tip after current D/E/G stack. Plan: `notes/ai-sdk-upgrade.md`. Provision:

```bash
tsk task fork --handoff notes/tsk-handoffs/adl-ai-sdk-upgrade.md adl-ai-sdk-upgrade
```
