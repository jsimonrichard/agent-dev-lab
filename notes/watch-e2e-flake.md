# `watch.e2e.test.ts` — why it goes red, and what is actually broken

**Status:** diagnosed, **not fixed**. Written 2026-09-08 for Lane D (§5 of
[`parallel-work-plan.md`](./parallel-work-plan.md)). Every claim below is from a run on this
machine or from the CI logs of run `34157533330`; where something is inferred rather than
observed it says so.

Lane D owns `AGENTS.md`, `packages/core/src/project/watch.e2e.test.ts` and `.github/`. The
defects below live in `apps/web/src/lib/` and `packages/core/src/project/`, so this file
reports them rather than changing them.

---

## The failing assertion

`GET /api/project picks up an atomic edit to src/workflows/answer-question.ts` writes
`answer-question.ts.<pid>.tmp` and renames it over `answer-question.ts`, then polls
`/api/project` for 20 s waiting on `generation >= 1`. On the PR #31 merge commit it reported:

```
generation: 0, lastReloadError: null
```

and the captured `vite dev` log contained no `[adl] reloading project…` line. `generation: 0`
with `lastReloadError: null` means `project.reload()` was **never called** — this is not a
reload that failed, and not a poll interval that was too short. A re-run of the identical
commit passed in 6.4 s.

---

## 1. There are two watch paths. Only one of them works.

`apps/web` has two independent ways to notice a project edit:

| Path                                                               | Owner                                                                | Enabled when                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `adlProjectReloadPlugin` → Vite's chokidar → Nitro `dispatchFetch` | `apps/web/src/lib/adl-project-reload-plugin.ts`                      | always, in `vite dev`                                            |
| `watchAdlProject` → `reload-gate` → `project.reload()`             | `packages/core/src/project/watch.ts` via `ensureAdlProjectFileWatch` | `shouldWatchProject()` — i.e. **not** `ADL_VITE_PROJECT_WATCH=1` |

`process-host.ts:15` documents the intended split: "File watch (`watchAdlProject` /
`reload-gate`) is a fallback when the Vite plugin does not see a change." Measured, the split
is inverted:

**(a) The Vite plugin's watcher never fires for a project root outside the Vite root.**
Instrumenting `devServer.watcher` with listeners for `add`, `change`, `unlink`, `addDir`,
`unlinkDir`, `error`, `ready` and `raw`: after `devServer.watcher.add(root)` the only events
ever delivered for the fixture tree were `raw` events for one direct child of the root. No
normalized `add`/`change` for any file, at any depth, ever — including the `.tmp` create and
the rename. `ready` never fired either. So `schedule()` is never called and the plugin never
dispatches `/api/project/reload`.

**(b) `ADL_VITE_PROJECT_WATCH` never reaches the code that reads it.** The plugin sets it in
`configureServer`, which runs in the Vite config isolate. Printing the environment from
`shouldWatchProject()` inside the Nitro worker:

```
ADL_VITE_PROJECT_WATCH=undefined  ADL_PROJECT_WATCH="1"  ADL_INSPECTOR_SERVE=undefined
```

`ADL_PROJECT_WATCH` is `"1"` only because `adl-project.server.ts:46-48` sets it itself at module
scope. The worker has a separate environment; the plugin's flag does not cross into it.

**So today every dashboard reload is driven by core's `fs.watch`, and the Vite plugin is dead
weight.** Confirmed directly — the reload that makes the test pass logs its trigger as the
temp file, from `watchAdlProject`:

```
[adl-debug] fs.watch reload -> gen 1 path=…/src/workflows/answer-question.ts.<pid>.tmp
```

(The debounce in `reload-gate` is what makes triggering on the `.tmp` create correct: by the
time the 150 ms timer fires, the rename has landed.)

**(c) Forcing the other branch reproduces CI's failure signature exactly.** Starting the same
dashboard with `ADL_VITE_PROJECT_WATCH=1` in its environment — so `shouldWatchProject()`
returns false and ownership goes to the plugin — gives, deterministically:

```
generation: 0, lastReloadError: null      # and no `[adl] reloading project…` in the log
```

That is the CI failure, character for character. The branch that hands watching to the Vite
plugin does not reload at all; it is not a fallback, it is a dead end.

### What this does not prove

It does not prove CI took that branch. On this machine the worker never sees the flag, and
there is no reason to think a GitHub runner differs. Two other ways to reach the same
signature were considered:

- **A dropped `fs.watch` event.** Measured against Bun 1.3.13's `fs.watch` directly, in the
  same shape `watchAdlProject` uses (non-recursive, per-directory, atomic temp+rename save):
  **0 misses in 400 rounds**, 200 idle and 200 with every core of a 24-core box saturated. So a
  plain dropped inotify event is not a likely explanation.
- **A watch that failed to install.** This one is not excluded, and the code makes it
  invisible:
  - `watch.ts:63-73` catches a throw from `fs.watch` and routes it to `onError`.
  - `process-host.ts:91-92` sets `host.watchedRoot` **before** calling `watchAdlProject`, and
    the returned dispose function is truthy whether or not any directory was actually
    subscribed. The `host.watchedRoot === project.root && host.watchDispose` guard then makes
    the failure permanent: no later `/api/project` request retries the install.
  - Nothing surfaces it. `lastReloadError` is only ever set by a failed _reload_, so
    `/api/project` reports `lastReloadError: null` for a watcher that never armed.

  An `ENOSPC` from `fs.inotify.max_user_watches` on a runner would therefore produce exactly
  `generation: 0, lastReloadError: null` and an empty log. This is a silent fallback in the
  sense of house rule 1: a watcher that failed to install is indistinguishable from a project
  nobody edited.

---

## 2. A second, unrelated failure of the same test — deterministic when `packages/core` is unbuilt

Reproduced 5/5 on a clean checkout of this workspace, and it is **not** the CI failure — the
signature differs:

```
generation: 0,
lastReloadError: "TRANSFORM_ERROR: `column` must be greater than or equal to 0
                  …/packages/core/src/project/load-config.ts:0:0"
```

Here the watcher works and `project.reload()` runs and throws. With `JITI_DEBUG=1`:

- **Initial load** transpiles three files — `adl.config.ts`, `src/adl.ts`,
  `src/workflows/answer-question.ts`. `@agent-dev-lab/core` is satisfied natively.
- **Reload** drops the jiti instance (`invalidateAdlConfigCache`, by design — see
  `load-config.ts:37-40`). The fresh instance then walks
  **the entire `packages/core/src` tree** through jiti's bundled Babel, ~60 files, and the
  transform of `packages/core/src/project/load-config.ts` throws
  `BABEL_TRANSFORM_ERROR` out of the bundled `@jridgewell/gen-mapping`.

The trigger is the absence of `packages/core/dist`: with it present jiti resolves
`@agent-dev-lab/core` to the built JS, imports it natively, and the reload takes **~300 ms**
(20 consecutive atomic edits, 0 missed). Without it, the test fails every time.
`turbo.json`'s `test` task declares no `dependsOn: ["^build"]` (unlike `test:node`), so whether
this test passes depends on whether anyone happened to build core first.

Two things are worth separating:

- **`dist` presence is the trigger, not the whole cause.** CI runs `test` before `build` with
  no `dist` and does _not_ hit this, so a second variable differs between a GitHub runner and
  this machine. Unidentified. The Babel failure also does not reproduce when jiti transpiles
  the same tree outside the Vite/Nitro worker (`jiti.import(packages/core/src/index.ts)`
  succeeds), so it needs that context.
- **Re-transpiling core on every reload is wrong regardless.** The reload exists to
  re-evaluate the _user's_ registry; pulling core's whole source through Babel makes each
  reload slow and gives ~60 more chances to fail. jiti's `nativeModules` option is the
  obvious lever — core is a workspace symlink, so jiti's "is this under `node_modules`?" test
  resolves through it and says no.

---

## 3. What would fix this

In rough order of value, none of it done here:

1. **One watch owner, not two.** Either delete the `ADL_VITE_PROJECT_WATCH` hand-off and let
   `watchAdlProject` own project watching outright (house rule 3 — one path, delete the
   special case), or make the plugin's chokidar actually watch an external root and keep the
   core watcher as genuine redundancy. What must not stay is the present arrangement, where a
   flag nobody delivers is the only thing keeping the working path switched on.
2. **Make a failed watch install loud** (house rule 1). Do not set `host.watchedRoot` unless
   at least one directory was subscribed; report a watch error on `/api/project` beside
   `lastReloadError` so a dead watcher is visible instead of looking like an idle project.
3. **Stop transpiling `packages/core` on reload** — `nativeModules: ["@agent-dev-lab/core"]`
   on the jiti instance, or resolve the package's `default` export condition.
4. **Give the e2e test something to assert about the watcher**, so its failure message says
   "the watcher never armed" rather than `generation: 0`. Until then, a red run on this test
   needs the `vite dev` log to be interpretable at all.

## Reproducing

The standalone harness used above (fixture, `bun --bun vite dev`, atomic edit, poll, keep the
log) is not checked in; it is `watch.e2e.test.ts` with the `rmSync` in the `finally` removed
and the log path printed. To reproduce finding 2 directly:

```bash
rm -rf packages/core/dist
bun test packages/core/src/project/watch.e2e.test.ts   # fails, TRANSFORM_ERROR
bun run build --filter=@agent-dev-lab/core
bun test packages/core/src/project/watch.e2e.test.ts   # passes in ~6s
```

To reproduce finding 1(c), add `ADL_VITE_PROJECT_WATCH: "1"` to the `env` in
`startDashboard()`.
