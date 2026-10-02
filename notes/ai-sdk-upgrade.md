# AI SDK upgrade (`ai` 5 → 6 → 7)

**Status:** Plan (2026-10-02). Not started.
**HANDOFF:** [`tsk-handoffs/adl-ai-sdk-upgrade.md`](./tsk-handoffs/adl-ai-sdk-upgrade.md)
**Upstream:** [Migrate 5→6](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0), [Migrate 6→7](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0), [AI SDK 7 announcement](https://vercel.com/changelog/ai-sdk-7).

---

## Goal

Bring `@agent-dev-lab/core` (and consumers: tools, web, playground, CLI scaffold) onto the current Vercel AI SDK line so hosts can use latest `ai` / `@ai-sdk/*` without forked type worlds. Today the monorepo pins `ai@^5.0.86` (resolved ~5.0.188); npm latest is **`ai@7.0.x`**.

---

## Principles

1. **One supported major at a time** on the published packages — do **not** try to type-check against `ai@5` and `ai@7` in the same release. Dual peer ranges (`^5 || ^7`) look friendly and usually produce unmaintainable conditional types; prefer a clean break with a changeset.
2. **`ai` is a peer, not a bundled product dependency.** `@agent-dev-lab/core` must **not** list `ai` under `dependencies` (today it does: `ai@^5.0.86`). Move it to **`peerDependencies`** (supported range = the upgraded major, e.g. `^7`) and keep a matching **`devDependency`** for monorepo typecheck/tests. Hosts (playground, CLI scaffold, end-user apps, `apps/web` as needed) install `ai` themselves. Build (`tsdown` `unbundle`) must keep `from "ai"` as external imports — never pack SDK sources into `dist/`. Same posture for any other package that imports `ai` directly.
3. **Upstream before workaround** — run `@ai-sdk/codemod` for v6 then v7; prefer SDK renames over ADL shims. Name any remaining shim.
4. **Stage the majors** — land 5→6 green, then 6→7. One concern can be one PR if both are mechanical; stop between if conflicts multiply.
5. **Fail closed** — no silent fallbacks for removed APIs (`CoreMessage`, `experimental_*` that become required renames).
6. **Reuse survey** — extend `AgentImpl` / re-exports / telemetry wiring; do not invent a second model loop.

---

## Reuse survey

| Surface                                                         | Role today                                  | Upgrade impact                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/core` **`dependencies.ai@^5.0.86`**                   | Installed with core (wrong long-term shape) | Move to **`peerDependencies: { ai: "^7" }`** + `devDependencies` for this repo                     |
| `AgentImpl` `streamText({ system, experimental_telemetry, … })` | Agent loop                                  | v7: `system`→`instructions`, telemetry package/`telemetry` rename                                  |
| `packages/core/src/index.ts` re-exports                         | Host convenience                            | Drop `CoreMessage` (removed in v6); update package docs; re-exports still resolve from host’s `ai` |
| Tests `MockLanguageModelV2` / `ai/test`                         | Contract tests                              | Confirm mock name/path still exists under v6/v7                                                    |
| `@ai-sdk/mcp@0.0.39` (tools)                                    | MCP provider                                | Bump to line matching `ai@7` (`@ai-sdk/mcp@2.x` today); MCP’s own peers stay host-owned            |
| Playground / scaffold `@ai-sdk/openai@^2`                       | Host models                                 | Bump to v7-aligned provider major; ensure `ai` is a **direct** dep of the host                     |
| `apps/web` `ai@^5`                                              | UI / types                                  | Same major as peer; web is a host — keep as direct dep (or peer if published for others)           |
| [`tracing.md`](./tracing.md)                                    | OTel story                                  | v7 moves OTel to `@ai-sdk/otel` + global registration                                              |

---

## Current → target

| Package                                 | Today (declared / resolved)             | Target                                                                    |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `ai` (core)                             | **`dependencies`** `^5.0.86` / ~5.0.188 | **`peerDependencies`** `^7` + **`devDependencies`** `^7` for the monorepo |
| `ai` (hosts: playground, scaffold, web) | varies / missing on some hosts          | Direct dependency matching the peer range                                 |
| `@ai-sdk/openai` (playground/scaffold)  | `^2.0.42`                               | v7-aligned major                                                          |
| `@ai-sdk/mcp`                           | `0.0.39`                                | latest matching `ai@7` (e.g. 2.0.x)                                       |
| Node                                    | `engines.node >=22` (already)           | Keeps satisfying AI SDK 7’s Node 22+ requirement                          |

**Out of scope for “support both 5 and 7”:** maintaining two peer majors in one publish. If a consumer must stay on 5, they stay on a prior ADL release.

---

## Numbered work

### 1. Inventory + matrix (short)

- List every `from "ai"` / `ai/test` / `@ai-sdk/*` import in the monorepo.
- Map each to v6 and v7 migration bullets (especially renames ADL already uses).
- Decide changeset semver: **breaking** for `@agent-dev-lab/core` (and tools if MCP/types change) — peer move alone is breaking for consumers who relied on transitive `ai`.

### 1b. Peer-dep shape (same fork as the major bump)

- Remove `ai` from `packages/core` `dependencies`.
- Add `peerDependencies: { "ai": "^7" }` (exact range = supported major after the upgrade).
- Add `devDependencies.ai` at the same major for core tests/typecheck.
- Confirm `tsdown` leaves `import … from "ai"` external (`unbundle: true` today — verify dist does not inline SDK).
- Ensure every **host** that runs agents (playground, CLI scaffold, docs examples, `apps/web` if it imports `ai`) declares `ai` directly.
- Document in core README / guides: “install `ai` alongside `@agent-dev-lab/core`.”
- Optional: `peerDependenciesMeta.ai.optional = false` (default) — missing peer should be loud for package managers that warn.

### 2. Upgrade 5 → 6

- Bump `ai` + `@ai-sdk/*` to 6-line versions.
- Run `npx @ai-sdk/codemod v6`.
- Fix remaining: `CoreMessage` re-export removal/alias period, `ToolCallOptions`→`ToolExecutionOptions` if touched, mock/test helpers.
- `bun run typecheck && bun run test` (+ tools MCP tests).

### 3. Upgrade 6 → 7

- Bump to `ai@^7` and matching providers/MCP.
- Run `npx @ai-sdk/codemod v7`.
- Telemetry: wire `@ai-sdk/otel` per upstream; update [`tracing.md`](./tracing.md) and `createAdlRuntime({ telemetry })` docs/behavior.
- `system` → `instructions` in `AgentImpl` (and any host prompts that relied on system-in-messages defaults if behavior changes).
- Confirm ESM-only posture (repo is already ESM-leaning; verify no CJS `require("ai")` in published paths).

### 4. Docs + scaffold + changeset

- Update packageDocumentation in `packages/core/src/index.ts` (“AI SDK v5” → v7).
- Playground / CLI scaffold pins; docs gotchas if any.
- Changesets for core, tools, web, cli as touched.
- Roadmap row → done; delete or shrink this note.

---

## Hotspots (known)

- **`ai` currently a hard dependency of core** — must become peer + host-owned install (not nested under core as the sole copy by design).
- Re-export of **`CoreMessage`** (removed in v6) from `@agent-dev-lab/core`.
- **`experimental_telemetry`** → `telemetry` + `@ai-sdk/otel` registration (v7).
- **`streamText({ system })`** → `instructions` (v7).
- **`MockLanguageModelV2`** / `ai/test` path stability across majors.
- MCP major jump with tools `createMcpToolProvider`.
- Usage fields (`cachedInputTokens` / `reasoningTokens`) if we surface them — removed/renamed across 6–7.

---

## Out of scope

- Dual-major peer support in one publish.
- Adopting `ToolLoopAgent` as ADL’s agent (we keep `Agent` / `streamText`).
- Replacing AI SDK stream internals (still non-goal in execution-control plan).
- Full DAP / suspend work (orthogonal).

---

## Success criteria

1. `@agent-dev-lab/core` declares `ai` only as a **peer** (plus monorepo `devDependency`); it is **not** in `dependencies` and is **not** inlined into `dist/`.
2. Hosts that execute agents install `ai@^7` (or the chosen pin) themselves; playground/scaffold/`apps/web` match.
3. `@ai-sdk/mcp` on a v7-compatible release; MCP tests green.
4. No remaining imports of removed v5/v6 APIs in first-party code; package docs say v7 and document the peer install.
5. Telemetry story documented and working under v7 rules (or explicitly deferred with a named follow-up if `@ai-sdk/otel` needs a second fork — prefer in-scope).
6. `.claude/gate.sh full` green.
7. Breaking changeset(s) published with migration notes (major bump **and** peer move).

---

## Gaps / not done

- No code upgrade yet; `ai` remains a core `dependencies` entry until this fork lands.
- Exact `@ai-sdk/openai` / `@ai-sdk/mcp` target versions to pin at implement time (derive from npm at fork start — do not hardcode stale minors in this note long-term).
- Whether telemetry lands in the same fork or a tiny follow-up if OTel registration fights process-host — decide in step 3; default same fork.
- Whether `@agent-dev-lab/web` stays a direct `ai` dep only (host) or also peers if other packages depend on web’s types — default: direct dep as host.
