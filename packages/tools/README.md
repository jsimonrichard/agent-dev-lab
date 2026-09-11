<img src="https://raw.githubusercontent.com/jsimonrichard/agent-dev-lab/main/assets/brand/logo.svg" alt="" width="40" height="40" align="left" />

# `@agent-dev-lab/tools`

Sandboxed file, bash, search (`grep` / `glob`), and `fetchUrl` tools for [`@agent-dev-lab/core`](https://www.npmjs.com/package/@agent-dev-lab/core) agents.

This package is optional. Core does not depend on it. Dangerous tools take their jail or executor as a **required** argument — there is no unsandboxed default. Missing host prerequisites fail with a clear error instead of running without a sandbox. The sandbox limits what a model can do through tool calls on this machine; it does not isolate tenants or untrusted project authors.

## Install

```bash
bun add @agent-dev-lab/tools
# or: npm install @agent-dev-lab/tools
```

`@agent-dev-lab/core` is a dependency of this package.

## Quick start

The usual surface is `createWorkspaceToolProvider`: file tools, `grep` / `glob`, and `bash` sharing one working directory.

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

`resolveDefaultSandboxRoot()` is `.data/sandbox` under the current working directory, or `ADL_SANDBOX_ROOT` when that env var is set. It only resolves a path — create the directory yourself.

Override the working directory per call (host- or workflow-set, never by the model):

```ts
await coder.run({
  user: "List the files here.",
  toolProviderContext: { cwd: "/path/to/another/folder" },
}).result;
```

## What's in this package

| Factory                                        | Tools                                                                               | When to use it                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| `createWorkspaceToolProvider`                  | `readFile`, `writeFile`, `editFile`, `grep`, `glob`, `bash`, `describeWorkspaceEnv` | Work on one folder                             |
| `createFileTools` / `createFileToolProvider`   | `readFile`, `writeFile`, `editFile`                                                 | File access only                               |
| `createSearchTools`                            | `grep`, `glob`                                                                      | Filesystem search only (`rg` via the executor) |
| `createBashTool` / `createBashToolProvider`    | `bash`                                                                              | Shell only                                     |
| `createFetchUrlTool` / `createWebToolProvider` | `fetchUrl`                                                                          | Read one http(s) URL as text or markdown       |

Providers also expose a `describe*Env` tool so the model can see the resolved root, byte caps, and bash permissions before it hits a denial.

Pass a provider as `AgentDefinition.tools` (or `agent.run({ tools })`) when `cwd` / `root` / timeouts should come from `toolProviderContext` on each call. Pass the plain tool objects when the sandbox is fixed at construction.

`fetchUrl` is not part of the workspace provider — it has no working directory. Combine it with `combineToolProviders` from `@agent-dev-lab/core` when an agent needs both.

This package does not search the web. Use your model provider's native search tool (for example `openai.tools.webSearch()`) when you want discovery; use `fetchUrl` when you already have an address.

## File tools

```ts
import { createFileTools } from "@agent-dev-lab/tools";

const files = createFileTools({ root: cwd });
```

Every path is confined to `root` after symlink resolution. The jail is a userland check, not a kernel boundary.

`writeFile` requires the parent directory to already exist. `editFile` replaces exactly one occurrence of `find` and fails if the string is missing or not unique.

## Bash

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

You choose the executor. The tool never picks one, and never falls back to unsandboxed execution.

| Executor                   | Platform     | Host packages                                             | Notes                                                                                         |
| -------------------------- | ------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createAsrtBashExecutor`   | Linux, macOS | Linux: `bubblewrap`, `socat`, `ripgrep`. macOS: `ripgrep` | Preferred default. Per-domain network allowlist. Process-wide sandbox config.                 |
| `createNativeBashExecutor` | Linux only   | `bubblewrap`                                              | No extra npm sandbox runtime. Network is all-or-nothing. Throws on macOS instead of no-oping. |

`allowWrite` is required — pass `[]` for a sandbox that can run commands but write nowhere.

ASRT's `SandboxManager` is process-global: the first executor that runs wins if you construct more than one with different policies. On process shutdown, call `SandboxManager.reset()` from `@anthropic-ai/sandbox-runtime` or the ASRT child processes keep the process alive.

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
