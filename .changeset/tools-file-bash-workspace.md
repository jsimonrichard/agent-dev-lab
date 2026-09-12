---
"@agent-dev-lab/tools": patch
---

Add the `@agent-dev-lab/tools` package: sandboxed file and bash tools plus `createWorkspaceToolProvider`. Jail/executor is required — no unsafe default. The file jail confines writes (and `editFile` reads of an existing path) after symlink resolution, including an outbound leaf symlink. Omitted `allowRead` on `createFileJail` / file / search defaults to the jail root; pass `UNBOUNDED_ALLOW_READ` (`"**"`) for host-wide reads (`null`/`[]` mean nothing readable). Omitted bash provider `allowWrite`/`allowRead` default to `[cwd]` via shared `fs-bounds` helpers (explicit lists do not follow a later cwd; read is not unioned with write). Escape-hatch executors require `allowWrite` and default omitted `allowRead` to `allowWrite`. File writes must also land under the executor's `allowWrite` (`[]` means no writes). Sandboxed commands get no host environment by default (`allowEnv`).
