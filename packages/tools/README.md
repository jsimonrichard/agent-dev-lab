<img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo.svg" alt="" width="40" height="40" align="left" />

# `@agent-dev-lab/tools`

Sandboxed file, bash, search (`grep` / `glob`), and `fetchUrl` tools for [`@agent-dev-lab/core`](https://www.npmjs.com/package/@agent-dev-lab/core) agents.

This package is optional. Core does not depend on it. Providers take a sandbox **policy** (`allowWrite`, …) and share a process-scoped executor pool, or an escape-hatch `executor`. There is no unsandboxed default. Missing host prerequisites fail with a clear error instead of running without a sandbox. The sandbox limits what a model can do through tool calls on this machine; it does not isolate tenants or untrusted project authors.

## Install

```bash
bun add @agent-dev-lab/tools
# or: npm install @agent-dev-lab/tools
```

`@agent-dev-lab/core` is a dependency of this package.

## Quick start

The usual surface is `createWorkspaceToolProvider`: file tools, `grep` / `glob`, `bash` sharing one working directory, and `fetchUrl`. Pass policy (not a constructed executor); load via `loadAdlProject` so `projectRoot` is on the tool-provider envelope for pooling.

```ts
import { mkdirSync } from "node:fs";

import { createAdlRuntime } from "@agent-dev-lab/core";
import { createWorkspaceToolProvider, resolveDefaultSandboxRoot } from "@agent-dev-lab/tools";
import { openai } from "@ai-sdk/openai";

const cwd = resolveDefaultSandboxRoot();
mkdirSync(cwd, { recursive: true });

const adl = createAdlRuntime({
  defaults: { model: openai("gpt-4o-mini") },
  projectRoot: process.cwd(), // or use loadAdlProject, which attaches this
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

`resolveDefaultSandboxRoot()` is `.data/sandbox` under the current working directory, or `ADL_SANDBOX_ROOT` when that env var is set. It only resolves a path — create the directory yourself.

Override the working directory per call (host- or workflow-set, never by the model). `cwd` does not spawn a new sandbox process — only policy changes do:

```ts
await coder.run({
  user: "List the files here.",
  toolProviderContext: { cwd: "/path/to/another/folder" },
}).result;
```

Call `dispose()` on the tool provider (or reload the project) to release pool refs; unused supervisors exit when the refcount hits zero.

## What's in this package

| Factory                                        | Tools                                                                                           | When to use it                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `createWorkspaceToolProvider`                  | `readFile`, `writeFile`, `editFile`, `grep`, `glob`, `bash`, `fetchUrl`, `describeWorkspaceEnv` | Work on one folder                             |
| `createFileTools` / `createFileToolProvider`   | `readFile`, `writeFile`, `editFile`                                                             | File access only                               |
| `createSearchTools`                            | `grep`, `glob`                                                                                  | Filesystem search only (`rg` via the executor) |
| `createBashTool` / `createBashToolProvider`    | `bash`                                                                                          | Shell only                                     |
| `createFetchUrlTool` / `createWebToolProvider` | `fetchUrl`                                                                                      | Read one http(s) URL as text or markdown       |

Providers also expose a `describe*Env` tool so the model can see the resolved root, byte caps, bash permissions, and `fetchUrl` allowlist before it hits a denial.

Pass a provider as `AgentDefinition.tools` (or `agent.run({ tools })`) when `cwd` / `root` / timeouts should come from `toolProviderContext` on each call. Pass the plain tool objects when the sandbox is fixed at construction.

`fetchUrl` is included in the workspace provider by default. Pass `fetchUrl: false` to omit it. Use `createWebToolProvider` (or `createFetchUrlTool`) alone when an agent only needs to retrieve URLs. Timeouts are `bashTimeoutMs` and `fetchTimeoutMs` so the two knobs cannot collide. Empty `allowedUrls` still allows public http(s) — it does not remove the tool.

This package does not search the web. Use your model provider's native search tool (for example `openai.tools.webSearch()`) when you want discovery; use `fetchUrl` when you already have an address.

## File tools

```ts
import { createFileTools } from "@agent-dev-lab/tools";

const files = createFileTools({ root: cwd });
```

Every path is confined to `root` after symlink resolution — writes always, and reads by default (`allowRead` omitted means `[root]`; pass `UNBOUNDED_ALLOW_READ` for host-wide reads). The jail is a userland check, not a kernel boundary.

`writeFile` requires the parent directory to already exist. `editFile` replaces exactly one occurrence of `find` and fails if the string is missing or not unique.

## Bash

Prefer policy on `createBashToolProvider` / `createWorkspaceToolProvider` (pooled). For a one-off tool without a provider, pass an executor explicitly:

```ts
import { createAsrtBashExecutor, createBashTool } from "@agent-dev-lab/tools";

const { bash } = createBashTool({
  executor: createAsrtBashExecutor({
    allowWrite: [cwd],
    allowedDomains: ["example.com"], // omit or `[]` for no network
  }),
  cwd,
});
```

The tool never picks an unsandboxed fallback. Providers default to the ASRT pool (`backend: "asrt"`); pass `backend: "native"` for direct `bwrap`, or `executor` as an escape hatch (mutually exclusive with policy / `backend`).

| Backend / factory          | Platform     | Host packages                                             | Notes                                                                          |
| -------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| pooled `backend: "asrt"`   | Linux, macOS | Linux: `bubblewrap`, `socat`, `ripgrep`. macOS: `ripgrep` | Preferred default. Per-domain network allowlist. Shared supervisor per policy. |
| pooled `backend: "native"` | Linux only   | `bubblewrap`                                              | No extra npm sandbox runtime. Network is all-or-nothing. Throws on macOS.      |
| `createAsrtBashExecutor`   | (same)       | (same)                                                    | Escape hatch when you must own the executor instance.                          |
| `createNativeBashExecutor` | (same)       | (same)                                                    | Escape hatch for a dedicated native executor.                                  |

On providers, omitted `allowWrite` / `allowRead` default to `[cwd]`; pass `[]` for a sandbox that can run commands but write nowhere, or `UNBOUNDED_ALLOW_READ` / `null` for host-wide reads. Escape-hatch executors still require `allowWrite` at construction; omitted `allowRead` defaults to `allowWrite`.

Pooled ASRT supervisors are keyed by project root + policy; call provider `dispose()` (project reload does this for outgoing providers) to release. Escape-hatch executors: call `executor.dispose()` yourself. Supervisors also exit if the host process dies (stdin keepalive).

A non-zero command exit code is data (`stdout` / `stderr` / `exitCode`), not a thrown tool error.

## Search

`grep` and `glob` run `rg` through the same executor as bash. The model supplies a pattern and optional in-root path / glob — not flags.

```ts
import { createSearchTools } from "@agent-dev-lab/tools";

const { grep, glob } = createSearchTools({ executor, root: cwd });
```

## `fetchUrl`

```ts
import { createFetchUrlTool } from "@agent-dev-lab/tools";

const fetchUrl = createFetchUrlTool({
  allowedUrls: ["https://docs.example.com/**"],
});
```

Retrieves **one** http(s) URL and returns readable text (HTML becomes markdown). Private, loopback, and link-local addresses are refused — including after redirects — unless you set `allowedUrls` or `allowPrivateNetwork: true`. A non-2xx status is returned as data. Treat the body as untrusted third-party content.

## Platform support

| Platform | File tools  | Bash / search          | `fetchUrl` |
| -------- | ----------- | ---------------------- | ---------- |
| Linux    | Supported   | ASRT or native `bwrap` | Supported  |
| macOS    | Supported   | ASRT only              | Supported  |
| Windows  | Unsupported | Unsupported            | Untested   |

## Documentation

- [Sandboxed tools](https://agent-dev-lab.com/guides/tools/)
- [Tool providers](https://agent-dev-lab.com/core/tool-provider/)
- [Tools API](https://agent-dev-lab.com/api/tools/readme/)

## License

[MIT](https://github.com/jsimonrichard/agent-dev-lab/blob/main/LICENSE) © J. Simon Richard
