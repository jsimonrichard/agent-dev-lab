# Tool-provider lifecycle (sandbox executor pool)

**Status:** Sections 1–4 + `onRunEnd` **implemented** (2026-09-12). Playground uses the pool; pool map is pinned on `globalThis` for tools HMR. No kernel shipped. `apps/docs` refresh is the remaining follow-up.

Parent notes (pointers only): [`future-extensions.md`](./future-extensions.md) (kernel still future; run-scoped hook now exists), [`tool-sandboxing.md`](./tool-sandboxing.md) (ASRT supervisor isolation).

## Goal

Long-lived bash sandbox resources (the ASRT supervisor child, and any future per-policy executor) are created, reused, and torn down without authors constructing or disposing executors. Same sandbox _policy_ shares one process; `cwd` stays a per-run argument. Project reload of user code is leak-free: the pool object stays, and only the executors whose policies are no longer referenced go away. Core contracts: optional `ToolProvider.dispose?()` (reload/unload) and `ToolProvider.onRunEnd?()` (per `agentCallId` episode).

## Principles

- Fail closed — no silent fallbacks. Unclear sharing → do not share. Unclear which of `executor` vs per-call policy applies → throw.
- Upstream before workaround — extend `ToolProvider` (already documented as able to hold a pool) rather than a host-side ASRT special case. `LoadedAdlProject.reload` already swaps a registry and pins stores; teardown hangs off that swap, not playground `process.exit()`.
- Generalize — hosts never branch on ASRT vs native. If a provider holds resources, the hook is `dispose?()`. The tools-layer pool is keyed by a canonical policy, not by executor class name in core.
- One concern per change — this file is the design. Implementation is the numbered sections below, each its own later changeset.
- Plan first; state what is not done.

## Reuse survey (this checkout, 2026-09-12)

Verified here — not restated from the reporter workspace.

| Existing piece                                                           | What it already does                                                                                                                                                                                                                           | This plan extends                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/tools/src/bash/provider.ts` `createBashToolProvider`           | Requires `executor`. `getTools` runs per `agent.run` / `agent.stream` and only rebuilds wrappers. `cwd` / `timeoutMs` may change; the executor (and therefore the supervisor) does not.                                                        | Optional executor; per-call policy; acquire from the pool.                                |
| `packages/tools/src/workspace/provider.ts`                               | Same: required `executor`, `cwd` per call, write policy fixed on that executor. Composes file/bash/web; not `combineToolProviders`.                                                                                                            | Same policy-in-context path; `dispose` forwards to the bash child provider.               |
| `packages/tools/src/bash/asrt-executor.ts` / `asrt-supervisor.ts`        | One supervisor child per `createAsrtBashExecutor` instance. `dispose()` closes stdin after `reset()`. Host-process death also kills the child (stdin EOF).                                                                                     | Unchanged isolation. Pool _reuses_ instances; it does not change the supervisor protocol. |
| `packages/tools/src/bash/executor.ts` `BashExecutor.dispose?()`          | Optional; already the executor-level release.                                                                                                                                                                                                  | Pool calls this when a policy’s refcount hits 0.                                          |
| `packages/core/src/tools/provider.ts` `ToolProvider`                     | `getTools` + optional `listTools` / `contextSchema`. JSDoc already names “a connection pool” as a reason to be a class. No `dispose`. `createToolProvider` / `combineToolProviders` do not forward one.                                        | Optional `dispose?()`. Helpers forward it.                                                |
| `packages/core/src/tools/resolve-agent-tools.ts`                         | Called from `AgentImpl` once per turn. Builds `ExtendedToolProviderContext` (`agentId`, `memoryScope`, optional `workflow`, raw `toolProviderContext`).                                                                                        | No run-end hook. Acquire stays inside `getTools`.                                         |
| `packages/core/src/project/resolve.ts` `LoadedAdlProject.reload`         | Re-imports config (jiti cache bust — **entire project module graph**, including files `adl.config` imports). Pins stores via `pinRuntimeStores`. Drops the old registry. Nothing disposes providers. This is the leak that motivated the lane. | After a successful swap, call `dispose?()` on outgoing registry providers.                |
| `packages/core/src/project/process-host.ts` `resetAdlProjectProcessHost` | Drops the cached project. No provider teardown.                                                                                                                                                                                                | Call the same dispose walk (or `LoadedAdlProject.dispose`) before drop.                   |
| `apps/playground/src/tools/sandbox.ts`                                   | Policy + `cwd` on `createWorkspaceToolProvider` (pooled ASRT / native). No author-held executor.                                                                                                                                               | Done (section 3).                                                                         |
| `notes/future-extensions.md` / `notes/tool-sandboxing.md`                | Flag the missing hook.                                                                                                                                                                                                                         | Status pointer only — this file is the decision.                                          |

`AdlRuntimeConfig.tools` is a plain `ToolSet`, not a `ToolProvider`. `AdlProjectConfig.tools` is registry-only `ToolSet`. The dispose walk is `config.agents[].tools` (and any nested providers a parent `dispose` forwards to).

## Decisions (brief Scope 1–6)

### 1. What `getTools` constructs today

**Implemented:** `createBashToolProvider` / `createWorkspaceToolProvider` take optional `executor` **or** policy (`allowWrite`, …). Pooled path acquires in `getTools`; wrappers are still rebuilt per call. Playground passes policy only. Escape-hatch `executor` remains for tests / custom backends.

### 2. When a new supervisor is justified

A new `createAsrtBashExecutor` is a new process. `cwd` in `toolProviderContext` is already a per-run argument and must not imply a new process. A new process is justified only when sandbox **policy** differs: `allowWrite`, `allowRead`, `denyRead`, `denyWrite`, `allowedDomains`, `deniedDomains` (the fields on `AsrtBashExecutorOptions` / `BashExecutorDescription`, minus `maxOutputBytes` which is not isolation policy).

### 3. Pool + per-call policy (chosen)

**Chosen: (c) policy is per-call (and construct-time default), and therefore a pool exists**, so authors do not construct executors or think about process identity.

- **Not (a)** — construct-once next to the provider leaves the leak and the author burden.
- **Not (b)** — an optional cache in front of today’s required `executor` still makes the author build the first one.

Default authoring shape:

```ts
createWorkspaceToolProvider({
  cwd: sandboxRoot,
  allowWrite: [sandboxRoot], // default policy; overridable per call
});
```

`getTools` merges `options` with `toolProviderContext` for policy the same way it already merges `cwd` / `timeoutMs`. Missing `allowWrite` after merge still throws (`INVALID_INPUT`) — no unsandboxed default.

`executor` remains a **mutually exclusive escape hatch** (tests, a custom `BashExecutor`). Passing both `executor` and a per-call policy field that would require a different process is an invariant break — throw. Do not ignore one side.

Backend for the pooled path defaults to ASRT (already the preferred executor). Native is an explicit opt-in (`backend: "native"` or equivalent). Core does not see this flag.

### 4. Cleanup sites

| Site                              | What runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host process exit                 | stdin EOF already kills ASRT supervisors. Still **call `dispose?()`** on shutdown so the child can `reset()` before exit (the Node hang that motivated supervisor isolation). EOF is a backstop, not the design.                                                                                                                                                                                                                                                                                                                                                                          |
| Author-held executor              | Nothing in core today. After this plan, the default path has no author-held executor. Escape-hatch authors call `executor.dispose()` themselves, or hang the executor behind a provider that implements `dispose`.                                                                                                                                                                                                                                                                                                                                                                        |
| **Project reload (user code)**    | **Leak-free and required for v1.** jiti busts the project graph; new provider instances are created. The **pool object is not in that graph** (`@agent-dev-lab/tools`). After a successful registry swap, core calls `dispose?()` on outgoing providers. Those calls **release refs**, they do not destroy the pool. Unused policies hit refcount 0 and those executors `dispose()`. Still-needed policies are re-acquired on the next `getTools` (brief recreate gap if `getTools` has not run yet — not a leak). Failed reload keeps the previous registry and must **not** dispose it. |
| `agent.run` end                   | **Not a hook in v1.** Acquire happens in `getTools`; release happens when the _provider instance_ is disposed (reload / host unload).                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Host / project unload             | Same dispose walk as reload, then the process-scoped pool disposes any leftover entries (tests, `resetAdlProjectProcessHost`).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Framework-dev / tools-package HMR | Pool map pinned on `globalThis` via `Symbol.for("@agent-dev-lab/tools:bashExecutorPool")` (same idea as the jiti cache in `load-config.ts`). Re-evaluating the tools module reuses the live map.                                                                                                                                                                                                                                                                                                                                                                                          |

### 5. Core API

**Chosen: optional `ToolProvider.dispose?(): void | Promise<void>`.** Called when that _provider instance_ is going away (outgoing registry after a successful reload; current registry on project unload / host shutdown).

Not chosen now:

- `onRunEnd` — add later if pool accumulation across many per-call policies on a long-lived provider becomes a real problem.
- Neither — would document “reload leaks until host exit,” which this plan rejects for user-code reload.

`createToolProvider` takes optional `dispose` on its config object (same “future additions don’t reorder” reason as today). `combineToolProviders` disposes every source that has `dispose`, and is itself idempotent. `createWorkspaceToolProvider`’s `dispose` forwards to its bash (and any other stateful) child.

Safe to call more than once. Errors from `dispose` must reach the caller / UI — no swallow. A failed dispose of one provider does not skip the rest (collect and throw, or equivalent).

### 6. Layering

| What                                                   | Where                                     |
| ------------------------------------------------------ | ----------------------------------------- |
| `dispose?()` contract + calling it on reload/unload    | `packages/core`                           |
| Policy key, pool, ASRT/native factory, acquire/release | `packages/tools`                          |
| Playground stops constructing executors                | `apps/playground` (after the tools slice) |
| `process.exit()`                                       | Not a lifecycle design                    |

## Trust boundary (sharing)

Same canonical policy **shares one executor / supervisor** inside **one host process and one ADL project root**.

- `cwd` is not part of the key.
- `agentId` / `memoryScope` / tenant are not part of the key. Two agents in the same project with the same policy share a jail. That is the point of the pool.
- The pool is **not** a package-wide singleton keyed only by policy. Key includes the **project root** (`LoadedAdlProject.root` / `ADL_PROJECT_ROOT`). Two projects in one process (tests already do this; `load-config.ts` already keys jiti that way) must not share a supervisor.
- Mutually untrusted tenants do not share a process. If a future host loads two untrusted projects, project-root in the key is the isolation that is actually implemented; do not claim stronger isolation.

How tools learns the project root: prefer an explicit value from the host (see open question below) over guessing from `cwd`. Until that is wired, fail closed — do not share across unknown roots.

## Pool mechanics

- **Identity:** process-scoped map in `@agent-dev-lab/tools`, keyed by `(projectRoot, backend, canonicalPolicy)`. Canonical form is sorted absolute paths / domains so `{ allowWrite: ["/a", "/b"] }` and the reverse are one entry. Relative paths are resolved or rejected — do not key on unresolved strings.
- **Acquire:** `getTools` (after merge) acquires. The provider instance records the keys it holds.
- **Release:** `provider.dispose()` decrements those keys. Refcount 0 → `executor.dispose()`. The map stays.
- **Concurrent runs** with different policies on one long-lived provider keep **both** executors. Do not evict the previous policy on the next `getTools` (that would break overlapping runs).
- **Accumulation:** a provider that sees many distinct policies over its life holds one executor per policy until _that provider_ is disposed. Acceptable for v1. Idle eviction or `onRunEnd` is a later hook, not a silent timeout.
- **Native:** same acquire/release path. A native executor with nothing to release omits `dispose`; the pool still refcounts so core never asks “is this ASRT?”
- **Tests:** existing `asrt-executor.test.ts` `after()` `dispose()` stays. Pool tests must not leave a child that pins `node --test`.

## Numbered work sections (shipping order)

Each section is one later changeset after this plan is reviewed. This lane stops at the plan.

### 1. Core `ToolProvider.dispose?()` and the reload/unload call

**Needs a core API change. This is the first implementation slice.**

- Add optional `dispose?()` on `ToolProvider`; thread through `createToolProvider` and `combineToolProviders`.
- After a successful `LoadedAdlProject.reload` swap, dispose outgoing `agent.tools` providers (identity `Set` so a shared object is disposed once). Failed reload: do not dispose.
- Add a project-level dispose/unload used by `resetAdlProjectProcessHost` (and a real host shutdown if one is added) that disposes the _current_ registry.
- Walk only registry agents. A `ToolProvider` allocated outside `config.agents` is not found — authors must hang it on an agent (or dispose it themselves). `input.tools` per-call overrides are not walked.
- Tests: outgoing provider `dispose` is called on successful reload; not called on failed reload; called once when two agents share one object; errors surface.

No pool and no provider API change in `@agent-dev-lab/tools` in this slice. Today’s construct-once authors can implement `dispose` to kill their executor and get leak-free user reload immediately.

### 2. Tools-layer pool + per-call policy

- Policy fields on bash/workspace options and context; merge like `cwd`.
- Process-scoped pool; acquire in `getTools`; release in provider `dispose`.
- `executor` escape hatch, mutually exclusive with pooled policy as above.
- Default backend ASRT.
- Tests: same policy → same executor; different policy → different child; `cwd` change does not spawn; dispose of last provider for a key kills the child; project-root keys do not collide.

### 3. Playground / authoring docs

- `apps/playground/src/tools/sandbox.ts` stops calling `createAsrtBashExecutor` / `createNativeBashExecutor` for the default agents.
- JSDoc / `packages/tools/README.md` describe policy-in-context and `dispose`. Do not link `apps/docs` from `notes/`. Touch `apps/docs` only if a current published claim is already false (verify first).

### 4. (Nice-to-have) Survive tools-package HMR

Pin the pool map on `globalThis` with `Symbol.for`, matching `load-config.ts`. Only if framework-dev leaks are worth the magic after slice 2.

## Out of scope (remaining)

- Changing ASRT isolation (supervisor subprocess, NDJSON, stdin keepalive).
- Per-domain `fetchUrl` allowlists, a positive deny-all for fetch, or `updateConfig()`.
- Implementing a Python/Jupyter kernel (the hook is the system; the tool is still future).
- Conversation-scoped kernel lifetime (`onRunEnd` is per `agentCallId`).
- Idle eviction of pool entries; Mastra-style long-running bash.
- Editing `apps/docs` (planned follow-up — verify published claims against pooled authoring).

## Decisions that were open (now closed)

1. **`projectRoot` on the envelope** — optional on `ExtendedToolProviderContext`; `LoadedAdlProject` attaches `project.root`. Pooled acquire throws if missing.
2. **`backend?: "asrt" | "native"`** on bash/workspace options (default `"asrt"`).
3. **Public `LoadedAdlProject.dispose()`** — idempotent; process-host reset/root switch await it.

## Success criteria (design lane — done)

Met when the design note landed. Implementation criteria below.

## Success criteria (sections 1–2)

1. User-code reload does not leave an ASRT supervisor for a policy the new registry no longer uses.
2. Authors can ship bash/workspace tools with policy + `cwd` and never call `createAsrtBashExecutor`.
3. Same policy + same project root ⇒ one supervisor; `cwd`-only changes do not spawn.
4. Hosts do not mention ASRT. Core only calls `dispose?()` / `onRunEnd?()`.
5. `onRunEnd` runs at the end of every `agent.run` / `agent.stream` (success, failure, abort).
6. `node --test` on tools still exits without an undisposed supervisor.
