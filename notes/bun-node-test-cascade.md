# The Bun `node:test` cascade — already fixed upstream in Bun 1.4

**Status:** investigated 2026-09-08 (Lane D, §5 of
[`parallel-work-plan.md`](./parallel-work-plan.md)). **Nothing filed, nothing to file** — the
bug does not exist in the current Bun release. This repo is pinned to `bun@1.3.13`, which
still has it.

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

## Minimal reproduction

Two files. The offender needs an **even number** of async tests that reject **after a real
(macrotask) suspension**:

```js
// a.test.js
import { test } from "node:test";
test("A1", async () => {
  await new Promise((r) => setTimeout(r, 5));
  throw new Error("boom");
});
test("A2", async () => {
  await new Promise((r) => setTimeout(r, 5));
  throw new Error("boom");
});

// b.test.js
import { describe, it } from "node:test";
describe("unrelated suite", () => {
  it("B1", () => {});
});
```

`bun test .` — `b.test.js` never runs; it throws at module evaluation.

The conditions are sharp, and were narrowed by bisecting `native-executor.test.ts` down to
duplicated copies of a single test:

| Vary                                           | Cascades?                                                     |
| ---------------------------------------------- | ------------------------------------------------------------- |
| 1, 3, 5 … failing async tests in the offender  | **no**                                                        |
| 2, 4, 6, 8 … failing async tests               | **yes** — parity, not timing (5/20/50 ms all behave the same) |
| rejection after `await Promise.resolve()` only | no — needs a macrotask suspension                             |
| synchronous `throw` in an `async` test body    | no                                                            |
| the same tests passing instead of failing      | no                                                            |
| `describe()` wrapper in the offender           | irrelevant — bare top-level `test()` cascades too             |

## Versions

| Bun        | Minimal repro             | `native-executor.test.ts` + `process-channel.test.ts`, `bwrap` hidden |
| ---------- | ------------------------- | --------------------------------------------------------------------- |
| **1.3.13** | cascades (n = 2, 4, 6, 8) | 15 tests ran, 1 error — the victim's 8 tests never run                |
| **1.4.0**  | clean (n = 2, 4, 6, 8)    | 22 tests ran, 11 fail — every failure is a real one                   |

Under 1.4.0 the victim file runs normally and the offender's failures are reported against the
offender, which is the correct behaviour. No attempt was made to find the commit that fixed it.

## What to do about it here

Nothing upstream. The repo-side follow-up is **the Bun upgrade itself** — `packageManager`,
`@types/bun`, `.github/workflows/ci.yml`'s `bun-version`, and `AGENTS.md`'s "Bun must be
version 1.3.13" all pin 1.3.13, and 1.4 is a major with its own breaking-change list
([oven-sh/bun#28792](https://github.com/oven-sh/bun/issues/28792)). That is its own lane, not a
line in this one.

Until then the behaviour stands as described: loud, non-zero exit, arbitrary victim. When
`bun test` reports an error in a file you did not touch, check whether an earlier file in the
run failed.
