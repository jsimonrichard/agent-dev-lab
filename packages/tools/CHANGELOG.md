# @agent-dev-lab/tools

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
