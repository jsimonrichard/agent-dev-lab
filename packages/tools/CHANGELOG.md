# @agent-dev-lab/tools

## 0.0.3

### Patch Changes

- Updated dependencies [12a811c]
- Updated dependencies [d76bb17]
- Updated dependencies [7c832ef]
- Updated dependencies [183807f]
- Updated dependencies [2b713d9]
- Updated dependencies [0f7ae59]
  - @agent-dev-lab/core@0.0.6

## 0.0.2

### Patch Changes

- 8d7d45b: Keep ASRT's Linux HTTP proxy reachable when `allowRead` is bounded. The host-wide deny that encodes a bound read list was tmpfs'ing `/tmp` over the bridge sockets, so allowed and denied domains both failed with `Proxy CONNECT aborted`.
- 15ef87f: Never remove a caller-supplied ASRT `tmpDir` on executor dispose (only auto-`mkdtemp` dirs are cleaned up), so shared explicit paths across pool keys stay intact.
- 42f60d0: Create an owned ASRT `TMPDIR` (or accept `tmpDir` with an ownership guard) so `mktemp` and other temp-file writers work without the embedder setting `CLAUDE_CODE_TMPDIR`.
- d8fb2b4: On usr-merged hosts, expand ASRT's host-wide read deny into real root directories instead of `"/"` so bwrap does not try to tmpfs symlink mounts like `/bin`.
- d36b604: `allowedDomains` defaults to `["*"]` and is documented as applying only when `allowNetwork` is true. The pool ignores domain lists while network is off so the default does not open the sandbox.
- 0285c58: `allowedDomains` schema help states that the list applies to bash and fetchUrl, and only when `allowNetwork` is true.
- 7aa9107: File, bash, web, and workspace `contextSchema`s declare the same hardcoded runtime defaults the providers already apply (`allowNetwork: false`, `allowEnv: []`, byte caps, timeouts), so hosts that sample `{}` can show those values instead of omitted keys.
- 7efb748: File, bash, and workspace `contextSchema`s default `denyRead` / `denyWrite` to `[]`, matching `resolveDenyList` (omit and `null` already mean deny nothing).
- 4514371: Workspace `fetchUrl` is omitted when `allowNetwork` is false (the default), matching the bash sandbox. Set `allowNetwork: true` (constructor or per-call context) to include it; `fetchUrl: false` still forces it off.
- 327033d: Workspace `allowedDomains` / `deniedDomains` now restrict `fetchUrl` as well as bash, using the same host-pattern language.
- 67bbb28: Workspace `listTools` still advertises `fetchUrl` when network is off, noting it is only added to a run when `allowNetwork` is true. `getTools` still omits the tool until then.
- af75445: Schema help on `cwd`/`root`, `allowWrite`, `allowRead`, and `tmpDir` states the runtime omit-default, which cannot be a Zod `.default()` because it depends on the sandbox working directory.
- a3fd6bc: Document ASRT overlay writes that look successful and that `bash.execute` must be drained with `for await`, not `await`.
- 115c116: Point the package `types` condition at `dist/*.d.ts` so consumers typecheck the published declarations instead of the package source (which is not a standalone program).
- 05ef9a7: Tool-provider context schemas no longer wrap defaulted fields in `.partial()`. The inspection UI treats Zod `.default()` as a present value (not optional) and shows it in the schema display.
- Updated dependencies [fcaf9ac]
- Updated dependencies [118059f]
- Updated dependencies [ae70fad]
  - @agent-dev-lab/core@0.0.5

## 0.0.1

### Patch Changes

- c02f941: ASRT `describe()` reports the caller's `denyRead` only. The host-wide `/` deny used to encode a bound `allowRead` stays inside the wrapper.
- a23ef6e: ASRT executors run in a supervisor subprocess. `dispose()` ends it; it also exits if the host process dies.
- 84247b6: Process-scoped bash executor pool keyed by project root, backend, and sandbox policy (including `allowEnv`). Same policy reuses one supervisor; providers release on `dispose()`. Omitted `allowEnv` inherits no host variables; pass `true` or a name/glob/`RegExp` allowlist.
- 138e98a: Pin the bash executor pool map on `globalThis` so tools-package HMR reuses live supervisors.
- fd78eb7: `describe*Env` reports resolved defaults: omitted `allowRead` is `[cwd]`, `"**"` (`UNBOUNDED_ALLOW_READ`) only when the host opted into host-wide reads, and `null`/`[]` mean nothing readable.
- 25524f8: Add `fetchUrl` (`createFetchUrlTool` / `createWebToolProvider`) to retrieve one http(s) URL as text or markdown. Private, loopback, and link-local addresses are refused unless a concrete-host `allowedUrls` entry or `allowPrivateNetwork` is set. Host-wildcard patterns (`**`, `http://*/**`, …) alone do not bypass the address check.
- 533ca32: File jail is allow/deny-only (`cwd` is a relative-path base, default home). File tools gain `denyWrite`; `describeFileEnv` reports `allowWrite` and `denyWrite`. Workspace forwards bash `denyWrite`.
- 630b29e: Add sandboxed `grep` and `glob` tools (`createSearchTools`) that run `rg` via argv, not a shell.
- c93d1c1: Shorten model-facing descriptions for `grep`, `glob`, `fetchUrl`, and `describe*Env` to what the agent needs to call them.
- 801309c: Add the `@agent-dev-lab/tools` package: sandboxed file and bash tools plus `createWorkspaceToolProvider`. Jail/executor is required — no unsafe default.
- 67e86a1: Document policy-based bash/workspace providers and the executor pool; prefer them over constructing an `executor` in the quick start.
- 59a93a0: `describeWorkspaceEnv` reports `bashTimeoutMs` and `fetchTimeoutMs`. The atomic providers' `timeoutMs` field is no longer copied into the combined payload.
- 6cbc235: Include `fetchUrl` in `createWorkspaceToolProvider` (`fetchUrl: false` omits it). Timeouts are `bashTimeoutMs` and `fetchTimeoutMs`.
- Updated dependencies [801309c]
- Updated dependencies [bcf5603]
- Updated dependencies [76c6bde]
- Updated dependencies [801309c]
- Updated dependencies [e01a47f]
- Updated dependencies [84247b6]
- Updated dependencies [bcf5603]
- Updated dependencies [801309c]
- Updated dependencies [851f524]
- Updated dependencies [bcf5603]
- Updated dependencies [8d85d21]
  - @agent-dev-lab/core@0.0.4
