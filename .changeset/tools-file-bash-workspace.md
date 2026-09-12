---
"@agent-dev-lab/tools": patch
---

Add the `@agent-dev-lab/tools` package: sandboxed file and bash tools plus `createWorkspaceToolProvider`. Jail/executor is required — no unsafe default. The file jail confines writes (and `editFile` reads of an existing path) after symlink resolution, including an outbound leaf symlink. Omitted file/search `allowRead` defaults to the jail root; pass `UNBOUNDED_ALLOW_READ` for host-wide reads. Omitted bash `allowWrite`/`allowRead` default to `[cwd]` (explicit lists do not follow a later cwd); file writes must also land under the executor's `allowWrite`. Sandboxed commands get no host environment by default (`allowEnv`).
