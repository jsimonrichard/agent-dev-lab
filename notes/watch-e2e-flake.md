# `watch.e2e.test.ts` — why it goes red, and what is actually broken

**Status:** **fixed.** Bun is on 1.4.2, `watchAdlProject` watches through chokidar, and the
Vite reload plugin is gone — one watcher, one reload per save. Written 2026-09-08, corrected
and closed 2026-09-10, for Lane D (§5 of
[`parallel-work-plan.md`](./parallel-work-plan.md)). Every claim below is from a run on this
machine or from the CI logs of run `34157533330`; where something is inferred rather than
observed it says so.

Lane D was scoped to `AGENTS.md`, `packages/core/src/project/watch.e2e.test.ts` and
`.github/`. The Bun upgrade and the watcher work below go past that, including the brief's
"no further `ci.yml` changes" — expanded at the maintainer's request once the cause turned out
to be the runtime rather than the code.

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

## 1. Bun 1.3.13's `fs.watch` loses atomic saves, and that is what the Vite path rides on

`apps/web` has two independent ways to notice a project edit:

| Path                                                                 | Owner                                                                | Enabled when           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| `adlProjectReloadPlugin` -> Vite's chokidar -> Nitro `dispatchFetch` | `apps/web/src/lib/adl-project-reload-plugin.ts`                      | always, in `vite dev`  |
| `watchAdlProject` -> `reload-gate` -> `project.reload()`             | `packages/core/src/project/watch.ts` via `ensureAdlProjectFileWatch` | `shouldWatchProject()` |

**(a) Vite watches the project root correctly, including an external one.**
`devServer.watcher.add(root)` works: instrumenting the watcher and dumping `getWatched()`
shows all three fixture directories subscribed within a second, and the watcher is never
closed.

```
[dbg +1003ms] t+1000: closed=false watchedRootsTotal=46
              underProjectRoot=["/tmp/adl-repro-…","/tmp/adl-repro-…/src","/tmp/adl-repro-…/src/workflows"]
```

`resolveChokidarOptions` ignores only `.git`, `node_modules`, `test-results`, the cache dir
and the out dir — nothing about being outside `config.root`. **An earlier revision of this note
claimed the Vite watcher never fires for an external root. That was wrong**; the instrumentation
behind it wrote its log file _inside_ the watched tree, which fed the watcher its own output.

**(b) The Vite path works for an in-place write and misses an atomic temp+rename.** Same
fixture, same dashboard, only the write style differs:

```
in-place  RAW  ["change","answer-question.ts",{watchedPath:".../src/workflows"}]
          RAW  ["change","answer-question.ts",{watchedPath:".../src/workflows/answer-question.ts"}]
          ALL  ["change","/tmp/…/src/workflows/answer-question.ts",{…}]   -> [adl] reloading project… -> [adl] reloaded

atomic    RAW  ["rename","answer-question.ts.<pid>.tmp",{watchedPath:".../src/workflows"}]
          (nothing else, ever)
```

Chokidar gets exactly one underlying event — the temp file being created — and nothing for the
rename. Its directory handler answers that event with a `readdir` diff, which by then shows the
temp gone and `answer-question.ts` unchanged, so no normalized event is emitted. The per-file
watcher on `answer-question.ts` cannot help either: the rename replaced the inode.

**(c) The cause is Bun 1.3.13's `fs.watch`, and it is fixed in Bun 1.4.** One atomic
temp+rename save over an existing file, watching the directory and the file directly:

| Runtime        | `fs.watch(dir)`                                          | `fs.watch(file)` |
| -------------- | -------------------------------------------------------- | ---------------- |
| Node 25        | 4 events, incl. `rename:answer-question.ts`              | 3 events         |
| **Bun 1.3.13** | **1 event** — `rename:answer-question.ts.<pid>.tmp` only | **0 events**     |
| Bun 1.4.0      | 4 events, incl. `rename:answer-question.ts`              | 3 events         |

This is the `spawn`/`spawnSync` class of Bun/Node divergence `AGENTS.md` already warns about,
in `fs.watch`. Under `bun --bun vite` on 1.3.13, chokidar is handed a single event it cannot
act on; under Node or Bun 1.4.0 it gets the full stream and the plugin reloads normally
(verified end to end — `[adl] reloading project…` appears for an atomic edit on 1.4.0).

**(d) `watchAdlProject` survives 1.3.13 by design, not by luck.** It acts on the event name
rather than re-reading the directory, and `shouldReloadAdlProjectPath` deliberately counts
`*.ts.<pid>.tmp` as the source file (`watch-path.ts:29`). The one event Bun does deliver is
therefore a trigger, and `reload-gate`'s 150 ms debounce means the rename has landed before the
reload runs. Its log line names the temp file:

```
[adl-debug] fs.watch reload -> gen 1 path=…/src/workflows/answer-question.ts.<pid>.tmp
```

So on 1.3.13 core's watcher is the only thing reloading an atomic save, and the e2e test — which
saves atomically on purpose — passes only because of it.

**(e) `ADL_VITE_PROJECT_WATCH` never reached the code that reads it.** The plugin set it in
`configureServer`, which runs in the Vite config isolate. Printing the environment from
`shouldWatchProject()` inside the Nitro worker:

```
ADL_VITE_PROJECT_WATCH=undefined  ADL_PROJECT_WATCH="1"  ADL_INSPECTOR_SERVE=undefined
```

`ADL_PROJECT_WATCH` is `"1"` only because `adl-project.server.ts` sets it itself at module
scope. So the branch meant to hand watching to the Vite plugin was never taken, which is the
only reason atomic saves reloaded at all on 1.3.13. Forcing `ADL_VITE_PROJECT_WATCH=1` into the
dashboard's environment disables core's watcher and reproduces CI's signature exactly:

```
generation: 0, lastReloadError: null      # and no `[adl] reloading project…` in the log
```

That flag has since been removed; `ADL_INSPECTOR_SERVE` (set only by `adl dashboard --serve`,
which runs the built Nitro output under Node with no Vite at all) is now the single off switch.

### What this still does not explain

CI's failure is intermittent, and everything above is deterministic. `generation: 0` with
`lastReloadError: null` says `reload()` was never called, and on 1.3.13 that means core's
watcher did not fire for the temp-file create. Bun's `fs.watch` delivered that one event in
**400/400** rounds here, idle and with a 24-core box saturated, so a plain dropped event is
unlikely. Not excluded: a watch that failed to _install_, which the code makes invisible —

- `watch.ts:63-73` catches a throw from `fs.watch` and routes it to `onError`.
- `process-host.ts:91-92` sets `host.watchedRoot` **before** calling `watchAdlProject`, and the
  returned dispose function is truthy whether or not any directory was subscribed. The
  `host.watchedRoot === project.root && host.watchDispose` guard then makes the failure
  permanent: no later `/api/project` request retries the install.
- Nothing surfaces it. `lastReloadError` is only ever set by a failed _reload_, so
  `/api/project` reports `lastReloadError: null` for a watcher that never armed.

An `ENOSPC` from `fs.inotify.max_user_watches` on a runner would produce exactly that. This is a
silent fallback in the sense of house rule 1: a watcher that failed to install is
indistinguishable from a project nobody edited.

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

## 3. What was done

1. **Bun 1.3.13 → 1.4.2.** The root fix. `fs.watch` reports the full event stream for an atomic
   save again, so any watcher — ours or chokidar's — can see an editor save. It also closes the
   `node:test` cascade in [`bun-node-test-cascade.md`](./bun-node-test-cascade.md).
2. **`watchAdlProject` now uses chokidar**, not a hand-rolled recursive `fs.watch`. The tree
   walk, the re-subscribe-on-new-directory path and the null-filename inotify special case are
   all gone.
3. **The Vite reload plugin is deleted**, along with `/api/project/reload` and
   `reloadAdlProjectForViteWatcher`. It was a second watcher over the same tree; on 1.4 each
   caught a different event from one atomic save and a single edit cost two jiti reloads
   (`generation: 2`). Measured after: `generation: 1`, for atomic and in-place saves alike. The
   plugin's `dispatchFetch` existed only to reach the worker isolate, and the core watcher
   already runs there.
4. **A watch that fails to arm is no longer silently permanent.** `watchAdlProject` returns
   `{ ready, close }`; `ready` rejects if the watcher never subscribed, the host forgets the
   root so the next request retries, and the error reaches SSE subscribers. Since
   `getLoadedAdlProject` awaits it, a first `/api/project` response now implies the watcher is
   armed — the property the e2e test was silently relying on.

### Still open

- **`packages/core/dist` (§2 below).** Untouched. `turbo.json`'s `test` still declares no
  `dependsOn: ["^build"]`.
- **CI's intermittency.** Everything measured was deterministic, so the original flake is
  explained by mechanism but not by timing. Item 4 above is what would have made it
  self-explaining; whether it was the cause is still unproven.
- **jiti re-transpiling core on reload** — `nativeModules: ["@agent-dev-lab/core"]` is the lever.

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

To reproduce finding 1(b)/(c) directly, watch a directory and a file with `node:fs.watch`,
write `f.tmp` and rename it over `f`, and count the events under `node`, `bun@1.3.13` and
`bun@1.4.0` — 4/3, 1/0 and 4/3 respectively.
