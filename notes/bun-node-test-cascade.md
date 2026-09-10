# The Bun `node:test` cascade — already fixed upstream in Bun 1.4

**Status:** closed 2026-09-10 (Lane D, §5 of
[`parallel-work-plan.md`](./parallel-work-plan.md)). **Nothing filed, nothing to file** — the
bug does not exist in the current Bun release, and the repo is now on `bun@1.4.2`.

## What was seen

Under `bun test`, a `node:test`-style file that fails can take an **unrelated** file's whole
suite down: the next test file dies at module evaluation with

```
NotImplementedError: describe() inside another test() is not yet implemented in Bun.
Track the status & thumbs up the issue: https://github.com/oven-sh/bun/issues/5090.
      at #checkNotInsideTest (node:test:113:26)
```

Observed twice in this repo — `asrt-executor.test.ts` in CI, and `process-channel.test.ts`
locally with `bwrap` hidden from `PATH`. The victim is arbitrary: it is whichever file Bun
evaluates next. It is **loud** — Bun counts the errored file as a failure and exits non-zero —
so no guard is needed in this repo.

## Is it `oven-sh/bun#5090`?

**No.** #5090 is _"Support the `node:test` built-in API"_, a 2023 feature request, closed
2026-08-07. It is cited here only because Bun's own `NotImplementedError` text tells the reader
to go there. The behaviour above is a bug in that support, not the request for it.

The issue that actually matches is **[oven-sh/bun#23077](https://github.com/oven-sh/bun/issues/23077)**
— same error, same `#checkNotInsideTest` guard, same "multiple `node:test` files run together"
shape. It was closed as completed (fix #23110, Oct 2025), and two later commenters report
hitting it again on 1.3.1 and on v1.4 — which is consistent with 1.3.13 still failing here.
Their v1.4 case was not reproduced; the shape below is clean on 1.4.0.

## Reproduction

Reliable, and re-verified on 2026-09-10. From a checkout with dependencies installed, hide
`bwrap` from `PATH` (build a directory of symlinks to `/usr/bin/*` minus `bwrap`) so the
executor tests fail, then run two files together:

```bash
cd packages/tools
PATH="<bun>:<binlink>" bun test src/bash/native-executor.test.ts src/bash/process-channel.test.ts
```

- **Bun 1.3.13** — `3 pass, 12 fail, 1 error`, `Ran 15 tests across 2 files`. The error is
  `process-channel.test.ts` dying at module evaluation; its 8 tests never run.
- **Bun 1.4.2** — `11 pass, 11 fail`, `Ran 22 tests across 2 files`. Every failure is a real
  `bwrap`-missing failure and nothing is lost.

A standalone two-file reduction (an offender with an even number of async tests rejecting after
a macrotask suspension, plus any file with a top-level `describe`) **did** reproduce during the
first investigation, and an earlier revision of this note published it along with a parity table
— even counts cascade, odd counts do not. **Re-testing on 2026-09-10 could not reproduce any of
it**, on 1.3.13 or 1.4.2, in either the `test()` or `describe()`/`it()` form, for n = 1, 2, 3, 4
or 6. Whatever the reduction actually depended on was not what the table said it was, so the
table has been withdrawn rather than left standing as fact. The repo-level reproduction above is
the one to trust; a smaller one would need to be re-derived from it.

## Versions

| Bun        | `native-executor.test.ts` + `process-channel.test.ts`, `bwrap` hidden |
| ---------- | --------------------------------------------------------------------- |
| **1.3.13** | 15 tests ran, 1 error — the victim's 8 tests never run                |
| **1.4.0**  | 22 tests ran, 11 fail — every failure is a real one                   |
| **1.4.2**  | 22 tests ran, 11 fail — same                                          |

Under 1.4.0 the victim file runs normally and the offender's failures are reported against the
offender, which is the correct behaviour. No attempt was made to find the commit that fixed it.

## What was done about it here

Nothing upstream, and nothing to work around. The repo moved to **Bun 1.4.2**, which fixes it —
see the Bun row in [`watch-e2e-flake.md`](./watch-e2e-flake.md) §3, since the same upgrade fixes
the `fs.watch` bug behind that one. 1.4 is a major with its own breaking-change list
([oven-sh/bun#28792](https://github.com/oven-sh/bun/issues/28792)); the gate, `packages/tools`
(89 under `bun test`, 31 under `node --test`) and the watch e2e were all green on it before the
pins moved.

If the repo is ever pinned back below 1.4, the behaviour returns as described: loud, non-zero
exit, arbitrary victim. When `bun test` reports an error in a file you did not touch, check
whether an earlier file in the run failed.
