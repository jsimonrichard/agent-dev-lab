---
title: Sandboxed tools
description: Optional @agent-dev-lab/tools package — file, bash, search, and fetchUrl.
---

[`@agent-dev-lab/tools`](https://www.npmjs.com/package/@agent-dev-lab/tools) is an optional package of sandboxed file, bash, search (`grep` / `glob`), and `fetchUrl` tools for `@agent-dev-lab/core` agents. Core does not depend on it. A project can omit the dependency entirely.

Providers take a sandbox **policy** (`allowWrite`, …) and share a process-scoped executor pool, or an escape-hatch `executor`. There is no unsandboxed default. Missing host packages fail with a clear error instead of running without a sandbox.

These tools raise the bar against a misbehaving **model**. They are not a multi-tenant security boundary.

The factories are [ToolProvider](/core/tool-provider/)s (or plain `ToolSet`s) so `cwd` / `root` can be set per `agent.run` via `toolProviderContext`.

## Install

```bash
bun add @agent-dev-lab/tools
# or: npm install @agent-dev-lab/tools
```

## Quick start

`createWorkspaceToolProvider` is the usual surface: file tools, `grep` / `glob`, `bash` sharing one working directory, and `fetchUrl`. Pass policy (not a constructed executor). Prefer `loadAdlProject` so `projectRoot` is on the tool-provider envelope for pooling (or pass `projectRoot` to `createAdlRuntime` in tests).

```ts
import { mkdirSync } from "node:fs";

import { createAdlRuntime } from "@agent-dev-lab/core";
import { createWorkspaceToolProvider, resolveDefaultSandboxRoot } from "@agent-dev-lab/tools";
import { openai } from "@ai-sdk/openai";

const cwd = resolveDefaultSandboxRoot();
mkdirSync(cwd, { recursive: true });

const adl = createAdlRuntime({
  defaults: { model: openai("gpt-4o-mini") },
  projectRoot: process.cwd(),
});

const coder = adl.createAgent({
  id: "coder",
  systemPrompt: "You edit files and run commands only inside the sandbox.",
  tools: createWorkspaceToolProvider({
    allowWrite: [cwd],
    cwd,
  }),
});
```

`resolveDefaultSandboxRoot()` is `.data/sandbox` under the current working directory, or `ADL_SANDBOX_ROOT` when set. It only resolves a path — create the directory yourself.

Override the working directory per call (host- or workflow-set, never by the model). Changing `cwd` relocates relative file paths and the bash working directory; it does **not** replace an explicit `allowWrite` / `allowRead` list. Omitted bash bounds default to `[cwd]` and therefore follow it. File writes must also land under `allowWrite`:

```ts
await coder.run({
  user: "List the files here.",
  toolProviderContext: { cwd: "/path/to/another/folder" },
}).result;
```

Call `dispose()` on the tool provider (project reload does this for outgoing providers) to release pool refs; unused supervisors exit when the refcount hits zero.

## Factories

| Factory                                        | Tools                                                                                           | When to use it                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `createWorkspaceToolProvider`                  | `readFile`, `writeFile`, `editFile`, `grep`, `glob`, `bash`, `fetchUrl`, `describeWorkspaceEnv` | Work on one folder                        |
| `createFileTools` / `createFileToolProvider`   | `readFile`, `writeFile`, `editFile`                                                             | File access only                          |
| `createSearchTools`                            | `grep`, `glob`                                                                                  | Filesystem search (`rg` via the executor) |
| `createBashTool` / `createBashToolProvider`    | `bash`                                                                                          | Shell only                                |
| `createFetchUrlTool` / `createWebToolProvider` | `fetchUrl`                                                                                      | Read one http(s) URL as text or markdown  |

Providers also expose a `describe*Env` tool so the model can see the resolved root, byte caps, bash permissions, and `fetchUrl` allowlist.

Pass a provider as `tools` when `cwd` / `root` / timeouts should come from `toolProviderContext`. Pass the plain tool objects when the sandbox is fixed at construction.

`fetchUrl` is included in the workspace provider by default. Pass `fetchUrl: false` to omit it. Use `createWebToolProvider` (or `createFetchUrlTool`) alone when an agent only needs to retrieve URLs. Timeouts are `bashTimeoutMs` and `fetchTimeoutMs` so the two knobs cannot collide. Empty `allowedUrls` still allows public http(s) — it does not remove the tool.

This package does not search the web. Use your model provider's native search tool (for example `openai.tools.webSearch()`) for discovery; use `fetchUrl` when you already have an address.

## File tools

Every path is confined to `root` after symlink resolution — writes always, and reads by default (`allowRead` omitted means `[root]`; pass `UNBOUNDED_ALLOW_READ` for host-wide reads). The jail is a userland check, not a kernel boundary.

`writeFile` requires the parent directory to already exist. `editFile` replaces exactly one occurrence of `find` and fails if the string is missing or not unique.

## Bash

Prefer policy on `createBashToolProvider` / `createWorkspaceToolProvider` (pooled). For a one-off tool without a provider, pass an executor explicitly. The tool never picks an unsandboxed fallback.

| Backend / factory          | Platform     | Host packages                                             | Notes                                                                          |
| -------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| pooled `backend: "asrt"`   | Linux, macOS | Linux: `bubblewrap`, `socat`, `ripgrep`. macOS: `ripgrep` | Preferred default. Per-domain network allowlist. Shared supervisor per policy. |
| pooled `backend: "native"` | Linux only   | `bubblewrap`                                              | No extra npm sandbox runtime. Network is all-or-nothing. Throws on macOS.      |
| `createAsrtBashExecutor`   | (same)       | (same)                                                    | Escape hatch when you must own the executor instance.                          |
| `createNativeBashExecutor` | (same)       | (same)                                                    | Escape hatch for a dedicated native executor.                                  |

On providers, omitted `allowWrite` / `allowRead` default to `[cwd]`; pass `[]` for a sandbox that can run commands but write nowhere, or `UNBOUNDED_ALLOW_READ` / `null` for host-wide reads. Escape-hatch executors still require `allowWrite` at construction (they have no cwd yet); omitted `allowRead` defaults to `allowWrite`. Sandboxed commands inherit no host environment by default — pass `allowEnv: true` or a name/glob/`RegExp` allowlist. Providers default to `backend: "asrt"`; pass `backend: "native"` or an `executor` (mutually exclusive with policy / `backend`).

Pooled supervisors are keyed by project root + policy. Provider `dispose()` (and project reload of outgoing providers) releases pool refs. Escape-hatch executors: call `executor.dispose()` yourself. Supervisors also exit if the host process dies (stdin keepalive).

A non-zero command exit code is data (`stdout` / `stderr` / `exitCode`), not a thrown tool error.

`grep` and `glob` run `rg` through the same executor. The model supplies a pattern and optional in-root path / glob — not flags.

## `fetchUrl`

Retrieves **one** http(s) URL and returns readable text (HTML becomes markdown). Private, loopback, and link-local addresses are refused — including after redirects — unless you set a concrete-host `allowedUrls` entry or `allowPrivateNetwork: true`. Host-wildcard patterns like `**` alone do not bypass the address check. A non-2xx status is returned as data. Treat the body as untrusted third-party content.

```ts
import { createFetchUrlTool } from "@agent-dev-lab/tools";

const fetchUrl = createFetchUrlTool({
  allowedUrls: ["https://docs.example.com/**"],
});
```

## Platform support

| Platform | File tools  | Bash / search          | `fetchUrl` |
| -------- | ----------- | ---------------------- | ---------- |
| Linux    | Supported   | ASRT or native `bwrap` | Supported  |
| macOS    | Supported   | ASRT only              | Supported  |
| Windows  | Unsupported | Unsupported            | Untested   |

## Related

- [Tools API](/api/tools/readme/) — TypeDoc for this package
- [Tool providers](/core/tool-provider/) — `ToolProvider` in core
- [createWorkspaceToolProvider](/api/tools/functions/createworkspacetoolprovider/), [createFetchUrlTool](/api/tools/functions/createfetchurltool/)
