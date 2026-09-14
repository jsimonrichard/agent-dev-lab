# Plan: `@agent-dev-lab/tools` 0.0.1 integration findings

From `~/Downloads/agent-dev-lab-tools-0.0.1-findings.md` (verus-coding-agent). Last
reconciled: **2026-09-14**.

## Goal

Make `createWorkspaceToolProvider` / ASRT bash work for an embedder that confines
reads to a crate, allowlists crates.io (or any domain), and typechecks the
published package under a strict tsconfig — without silent success or silent empty
tool results.

## Principles

- Fail closed: a broken proxy is `INIT_FAILED`, not a curl transport error that
  looks like a domain deny.
- Prefer ASRT's own hooks (`CLAUDE_CODE_TMPDIR`, `wrapWithSandboxArgv` custom
  filesystem config, `getLinuxHttpSocketPath`) over forking the runtime.
- Encode allow-read the same way we already do (`denyRead: ["/"]` + carve-outs);
  add infrastructure paths to that carve-out rather than a second encoding.
- One concern per changeset.
- Docs for behavior we do not own (ASRT overlay writes, AI SDK streaming
  `execute`).

## Reuse survey

| Finding | Existing modules | Action |
| ------- | ---------------- | ------ |
| 1 Network | `asrt/executor.ts` (deny `/` + `asrtPackageDir` + `existingSystemReadPaths`), `asrt/supervisor.ts` (`wrapWithSandboxArgv`), `asrt/executor.test.ts` (deny-only network test) | Extend the same allowRead carve-out with Linux bridge sockets after `initialize`; add a positive allowlist test. Native executor is out of scope (all-or-nothing `--share-net`). |
| 2 TMPDIR | ASRT `generateProxyEnvVars` / `getDefaultWritePaths`; we already spawn the supervisor with inherited env | New `ensureOwnedDirectory` next to ASRT; `tmpDir` on executor/policy; set `CLAUDE_CODE_TMPDIR` on the supervisor spawn env; add the path to the ASRT allowWrite list (upstream write-defaults still hardcode `/tmp/claude`). Native executor already uses `--tmpfs /tmp`. |
| 3 Types | `packages/tools/package.json` `types` + `exports.types` → `src` (same pattern as core) | Point tools (only) at `dist/*.d.ts`. `turbo` `typecheck` must `dependsOn: ["^build"]` so playground/CI resolve dist. Do not change core in this slice. |
| 4 Overlay writes | README + `apps/docs/.../guides/tools.md` jail note | Document next to the existing userland-jail sentence. |
| 5 Streaming bash | `createBashTool` already forwards the generator; `BashExecutor.run` doc comment | README/docs `for await` example for direct/non-SDK calls. |

## Numbered work sections

1. **ASRT proxy under bounded reads** — after `SandboxManager.initialize`, union
   `getLinuxHttpSocketPath` / `getLinuxSocksSocketPath` into wrap `allowRead` when
   `denyRead` contains `/`. Assert the HTTP socket exists (clear `INIT_FAILED`).
   Test: bounded default + `allowedDomains: ["example.com"]` returns HTTP 200;
   a non-listed host fails with a policy denial, not `Proxy CONNECT aborted`.
2. **Owned `tmpDir`** — default `mkdtemp`; optional `tmpDir` with lstat ownership
   guard (no symlink, uid match, not group/other-writable). `CLAUDE_CODE_TMPDIR`
   on the supervisor. Test: `mktemp -d` succeeds inside the sandbox.
3. **Published types → dist** — `package.json` + turbo typecheck graph + playground
   tsconfig comment.
4. **Docs** — overlay writes and bash `for await`.

## Out of scope

- Changing ASRT overlay-write semantics or rewriting curl's deny wording.
- Changing `createBashTool.execute` to detect `await` vs iterate.
- `@agent-dev-lab/core` `types` field (same src pattern; not this consumer break).
- Native-executor TMPDIR (already a fresh `/tmp`).

## Success criteria

1. `curl https://example.com` inside a default-bounded ASRT sandbox with
   `allowedDomains: ["example.com"]` exits 0 with HTTP 200.
2. The same sandbox against a non-listed host exits non-zero without
   `Proxy CONNECT aborted`.
3. `mktemp -d` exits 0 without the embedder setting `CLAUDE_CODE_TMPDIR`.
4. A consumer resolving `@agent-dev-lab/tools` types gets `dist/index.d.ts`, not
   `src/index.ts`.
5. README + tools guide name overlay writes and the streaming `execute` contract.
