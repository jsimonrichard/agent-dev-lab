---
title: Sandboxed tools
description: Optional @agent-dev-lab/tools package — file, bash, search, and fetchUrl.
---

[`@agent-dev-lab/tools`](https://www.npmjs.com/package/@agent-dev-lab/tools) is an optional package of sandboxed file, bash, search (`grep` / `glob`), and `fetchUrl` tools for `@agent-dev-lab/core` agents. Core does not depend on it. A project can omit the dependency entirely.

Dangerous tools take their jail or executor as a **required** argument — there is no unsandboxed default. Missing host packages fail with a clear error instead of running without a sandbox.

These tools raise the bar against a misbehaving **model**. They are not a multi-tenant security boundary.

The factories are [ToolProvider](/core/tool-provider/)s (or plain `ToolSet`s) so `cwd` / `root` can be set per `agent.run` via `toolProviderContext`.

## Install

```bash
bun add @agent-dev-lab/tools
# or: npm install @agent-dev-lab/tools
```

## Quick start

`createWorkspaceToolProvider` is the usual surface: file tools, `grep` / `glob`, `bash` sharing one working directory, and `fetchUrl`.

```ts
import { mkdirSync } from "node:fs";

import { createAdlRuntime } from "@agent-dev-lab/core";
import {
  createAsrtBashExecutor,
  createWorkspaceToolProvider,
  resolveDefaultSandboxRoot,
} from "@agent-dev-lab/tools";
import { openai } from "@ai-sdk/openai";

const cwd = resolveDefaultSandboxRoot();
mkdirSync(cwd, { recursive: true });

const adl = createAdlRuntime({ defaults: { model: openai("gpt-4o-mini") } });

const coder = adl.createAgent({
  id: "coder",
  systemPrompt: "You edit files and run commands only inside the sandbox.",
  tools: createWorkspaceToolProvider({
    executor: createAsrtBashExecutor({ allowWrite: [cwd] }),
    cwd,
  }),
});
```

`resolveDefaultSandboxRoot()` is `.data/sandbox` under the current working directory, or `ADL_SANDBOX_ROOT` when set. It only resolves a path — create the directory yourself.

Override the working directory per call (host- or workflow-set, never by the model):

```ts
await coder.run({
  user: "List the files here.",
  toolProviderContext: { cwd: "/path/to/another/folder" },
}).result;
```

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

Every path is confined to `root` after symlink resolution. The jail is a userland check, not a kernel boundary.

`writeFile` requires the parent directory to already exist. `editFile` replaces exactly one occurrence of `find` and fails if the string is missing or not unique.

## Bash

You choose the executor. The tool never picks one.

| Executor                   | Platform     | Host packages                                             | Notes                                                                                         |
| -------------------------- | ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createAsrtBashExecutor`   | Linux, macOS | Linux: `bubblewrap`, `socat`, `ripgrep`. macOS: `ripgrep` | Preferred default. Per-domain network allowlist. Process-wide sandbox config.                 |
| `createNativeBashExecutor` | Linux only   | `bubblewrap`                                              | No extra npm sandbox runtime. Network is all-or-nothing. Throws on macOS instead of no-oping. |

`allowWrite` is required — pass `[]` for a sandbox that can run commands but write nowhere.

ASRT's `SandboxManager` is process-global: the first executor that runs wins if you construct more than one with different policies. On process shutdown, call `SandboxManager.reset()` from `@anthropic-ai/sandbox-runtime` or the ASRT child processes keep the process alive.

A non-zero command exit code is data (`stdout` / `stderr` / `exitCode`), not a thrown tool error.

`grep` and `glob` run `rg` through the same executor. The model supplies a pattern and optional in-root path / glob — not flags.

## `fetchUrl`

Retrieves **one** http(s) URL and returns readable text (HTML becomes markdown). Private, loopback, and link-local addresses are refused — including after redirects — unless you set `allowedUrls` or `allowPrivateNetwork: true`. A non-2xx status is returned as data. Treat the body as untrusted third-party content.

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
