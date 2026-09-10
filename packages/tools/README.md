# @agent-dev-lab/tools

Sandboxed file/bash/web-search tools for `@agent-dev-lab/core` agents. Design doc:
[`notes/tool-sandboxing.md`](../../notes/tool-sandboxing.md).

**Status: not yet published.** `private: true` — versioned via changesets but not part of
`ci:publish` (see `.changeset/README.md`) until the package is ready to ship.

## Provider-native tools — check before building one here

Before adding a new tool to this package, check whether the configured model provider already
ships it server-side. Audited directly against this monorepo's actual installed packages
(`ai@5.0.188`, `@ai-sdk/openai@2.0.109` — the **only** model provider installed anywhere in this
repo; no `@ai-sdk/anthropic`, `@ai-sdk/google`, etc.) rather than assumed from prior knowledge.
`ai` itself ships no provider tools — `tool()`/`streamText`/`generateText` are provider-agnostic
plumbing. Every hosted tool below comes from `@ai-sdk/openai`'s `openai.tools` (confirmed via
that package's `dist/index.d.mts`: `openaiTools = { codeInterpreter, fileSearch,
imageGeneration, localShell, webSearch, webSearchPreview }`) and needs **no ADL wrapper** for the
rows marked "skip" — a project adds `tools: { ...openai.tools.webSearch() }` directly.

| This package's tool (planned or done)        | OpenAI provider-native equivalent                     | Server-executed by OpenAI?                                                                                                                                                                                                                                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web search (planned)                         | `openai.tools.webSearch()` (`web_search`)             | **Yes** — search and page fetch both happen on OpenAI's infra; the tool result already carries cited sources when it reaches ADL.                                                                                                                                                                                                                             | **Skip a custom implementation as the primary path.** The default `openai(modelId)` factory used in this repo (e.g. `apps/playground/src/model.ts`) already resolves to the Responses-API-backed model this needs — no extra call required. Keep a custom fallback (fetch + domain allow/deny + SSRF guard, per `tool-sandboxing.md`) only for providers/models without a native tool. |
| Bash (`createBashTool`, done)                | `openai.tools.localShell()` (`local_shell`)           | **No** — confirmed by reading the compiled source (`createProviderDefinedToolFactoryWithOutputSchema(...)`, no `execute`): it only standardizes the tool-call _schema_. The calling application still runs the command and streams back output, same as `createBashTool` today. Also restricted to `gpt-5-codex`/`codex-mini-latest` per its own doc comment. | **Not a skip.** Adopting this schema would narrow model support without removing any sandboxing work this package owns. `createBashTool`/`BashExecutor` stays as-is.                                                                                                                                                                                                                   |
| Grep/glob search (planned)                   | none                                                  | n/a                                                                                                                                                                                                                                                                                                                                                           | **Not a skip.** No provider can search this project's own filesystem. Build as planned.                                                                                                                                                                                                                                                                                                |
| File editing (`createFileTools`, done)       | `openai.tools.fileSearch()` (`file_search`)           | Yes, but over an OpenAI-hosted vector store of files uploaded ahead of time.                                                                                                                                                                                                                                                                                  | **Not a skip — easy to mistake for one.** `fileSearch` is retrieval over pre-uploaded, OpenAI-indexed documents, not read/write/edit access to the project's own files on disk. Flagging explicitly since the name alone looks like a match.                                                                                                                                           |
| `fetchUrl` (`createFetchUrlTool`, done)      | none                                                  | n/a                                                                                                                                                                                                                                                                                                                                                           | **Not a skip.** `fileSearch` is not a substitute (see above); there is no "fetch this one arbitrary URL" provider tool. Built in `src/web/`.                                                                                                                                                                                                                                           |
| Todo/plan-tracking (planned, not yet placed) | none                                                  | n/a                                                                                                                                                                                                                                                                                                                                                           | **Not a skip.** Pure in-memory per-run state; no provider concept covers it.                                                                                                                                                                                                                                                                                                           |
| _(not on any roadmap — noting it's free)_    | `openai.tools.codeInterpreter()` (`code_interpreter`) | Yes — runs Python in an OpenAI-managed sandboxed container.                                                                                                                                                                                                                                                                                                   | If a "run Python for data analysis" tool is ever requested, skip building a sandbox for it — this is fully hosted, zero sandboxing surface for ADL.                                                                                                                                                                                                                                    |
| _(not on any roadmap — noting it's free)_    | `openai.tools.imageGeneration()` (`image_generation`) | Yes.                                                                                                                                                                                                                                                                                                                                                          | No ADL work needed at all — a project adds it directly to a `tools:` object if it wants it.                                                                                                                                                                                                                                                                                            |

**When another provider is added:** re-run this audit against that provider's own
`@ai-sdk/<provider>` package before assuming any row above generalizes. Anthropic's hosted tools
(`bash`, `text_editor`, `computer`) are, by reputation, mostly client-executed like `local_shell`
above rather than server-executed like `web_search`/`code_interpreter` — but that has **not**
been verified against actual installed types in this repo (no `@ai-sdk/anthropic` dependency
exists here), so don't treat it as confirmed until someone checks it the same way this table was
built.

## Platform support

`fetchUrl` (`src/web/`) is platform-independent — it uses only WHATWG `fetch`/`URL`/`AbortSignal`
and `node:dns`, with no native dependency and no per-OS backend — so it is not broken out per
platform below. It is exercised under both Bun and Node (see [Testing](#testing)).

| Platform | File tools (`createFileTools`)                                                                                                                                                                                                                  | Bash tool (`createBashTool`)                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux    | Supported, tested                                                                                                                                                                                                                               | Two `BashExecutor`s: `createAsrtBashExecutor` (needs `bubblewrap`, `socat`, `ripgrep` on `PATH`) and `createNativeBashExecutor` (needs only `bubblewrap`). Both refuse to run with a clear error if their prerequisites are missing — never a silent fallback to unsandboxed. |
| macOS    | Supported, tested                                                                                                                                                                                                                               | `createAsrtBashExecutor` only (needs `ripgrep` on `PATH`) — `createNativeBashExecutor`'s `sandbox-exec` backend isn't implemented yet (needs a Mac to build/verify, which this dev environment doesn't have)                                                                  |
| Windows  | **Untested, not currently supported** — `path`/`fs.realpath` symlink semantics differ (drive letters, UNC paths, case-insensitive-but-case-preserving filesystems) and none of that has been verified. Treat as unsupported until this changes. | Not supported                                                                                                                                                                                                                                                                 |

## Packages

- `src/file/` — `createFileTools({ root, maxReadBytes?, maxWriteBytes? })`: `readFile`/`writeFile`/`editFile`
  tools jailed to `root`. See `jail.ts`'s doc comment for the jail's threat model and known
  limitations (in particular: it's a userland check, not a kernel-enforced boundary — see the
  TOCTOU note there).
- `src/bash/` — `createBashTool({ executor, cwd })`, the model-facing tool, plus two
  `BashExecutor` implementations to pass it:
  - `createAsrtBashExecutor({ allowWrite, ... })` — backed by
    [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropic-experimental/sandbox-runtime).
    The preferred default. See `asrt-executor.ts`'s doc comment for the process-global-singleton
    caveat and why there's no fallback to an unsandboxed executor when prerequisites are missing.
  - `createNativeBashExecutor({ allowWrite, ... })` — direct `bwrap` (Linux only; `darwin`
    throws a clear "not implemented" error rather than silently doing nothing). No npm
    dependency, no network-proxy layer, but network access is all-or-nothing (no per-domain
    allowlist) and there's no violation logging. See `native-executor.ts`'s doc comment for the
    bind-mount ordering rules and other gotchas found only by testing against real `bwrap`.

  `BashExecutor.run()` streams progress (`{ done: false, ... }` updates, then one final
  `{ done: true, ... }`) rather than a single `Promise` — it's the same shape the AI SDK's tool
  `execute` accepts for a streaming tool, so `createBashTool` forwards it directly. Both
  executors share the same spawn/stream/truncate/timeout-kill logic
  (`process-channel.ts`'s `runArgvIntoChannel`) — only how each builds its `argv`/`env` differs.

- `src/web/` — `createFetchUrlTool({ allowedUrls?, allowPrivateNetwork?, timeoutMs?, maxResponseBytes?, maxRedirects? })`:
  a `fetchUrl` tool that retrieves **one** URL and returns its body as readable text/markdown.
  The sibling of web search, not a replacement — search _finds_ pages, this _reads_ one. Web
  search itself is deliberately not built here (see the provider-native table above).

  Almost all of this module is the threat model rather than the fetch — see
  [`src/web/README.md`](./src/web/README.md) for the full design: the address guard (an
  allowlist against `ipaddr.js`'s `range()` classification, checked on a literal IP and on a
  domain's resolved address, both regardless of scheme — `https:` gets TLS's own certificate
  check as a second, independent backstop on top), re-checked on every redirect hop; `http:` IP
  pinning (dials the exact address `assertAllowedUrl` validated via `node:http`, closing the
  DNS-rebinding TOCTOU the check alone can't — `https:` relies on the TLS backstop instead, since
  pinning it would also mean pinning SNI); `allowedUrls`' glob/`RegExp` exemption language; the
  `allowPrivateNetwork` opt-out; the citations (a real CVE, a comparable framework's default, an
  evaluated-and-declined npm library) behind all of the above; the untrusted-content posture
  (including stripping a `javascript:`/`data:` link or image down to its visible text) and library
  choice `extract.ts` implements for reducing a response to text.

  **Dependencies added:** `turndown` (+ its one dependency `@mixmark-io/domino`) and `ipaddr.js`
  — three runtime packages, no native builds. Called out because this package is meant to be
  independently installable; the seven-package `@mozilla/readability` + `linkedom` option was
  rejected on that basis (see the module README for the full comparison).

  **Production lifecycle note:** a process using `createAsrtBashExecutor` must call
  `SandboxManager.reset()` (from `@anthropic-ai/sandbox-runtime`) on its own shutdown path, or
  it will neither exit cleanly nor release ASRT's child processes — see `asrt-executor.ts`'s doc
  comment and `notes/tool-sandboxing.md`'s testing section for how this was found.

## Tool providers

For projects that want `cwd`/`root`/`timeoutMs`/byte caps set per `agent.run()` call (by the
workflow/host, via `toolProviderContext`) instead of fixed when the agent is built, each tool
above has a `ToolProvider` wrapper — see `packages/core`'s `ToolProvider`/`createToolProvider`:

- `createBashToolProvider({ executor, cwd?, timeoutMs?, safetyCheck? })` — the command-only
  sandbox primitive; no file jail attached. `safetyCheck` optionally layers an AI-based check
  (a `Workflow<{ command, cwd }, { safe, reason }>`) on top of the OS-level sandbox, for
  non-filesystem dangerous intent (fork bombs, resource exhaustion, ...) a jail can't catch.
- `createFileToolProvider({ root?, maxReadBytes?, maxWriteBytes? })` — the file-only primitive.
- `createWebToolProvider({ allowedUrls?, timeoutMs?, maxResponseBytes?, maxRedirects? })` — the
  `fetchUrl` primitive. Deliberately **not** folded into `createWorkspaceToolProvider`: that one is
  the "file tools and bash sharing one `cwd`" surface, and `fetchUrl` has no `cwd` and touches no
  filesystem, so it is a peer — combine them with `combineToolProviders` when an agent needs both.
- `createWorkspaceToolProvider({ executor, cwd?, timeoutMs?, maxReadBytes?, maxWriteBytes?,
safetyCheck? })` — the Mastra-style combined surface, file tools + `bash` sharing one `cwd`.
  Use this (not a manual merge of the two providers above) when an agent needs "everything for
  working on a codebase in one folder"; use the atomic providers directly for a narrower need.

Every provider also adds a describe-env tool reporting its actual, resolved configuration
(cwd/root, byte caps, the bash executor's writable/denied paths and network access) — so the
model can learn its own constraints before hitting a denial, and tell the user precisely what
permission it would need: `describeBashEnv`, `describeFileEnv`, `describeWebEnv`, or
`describeWorkspaceEnv` (merging the file and bash ones) depending on the provider — named for their actual scope rather than a generic
`describeEnvironment`, since none of them know about other tools an agent might have with their
own network access. `toolProviderContext` values are trusted (set by the workflow/host, never
the model directly) — see `notes/tool-sandboxing.md`'s design notes for what that does and
doesn't let a caller reconfigure.

`resolveDefaultSandboxRoot(projectRoot?)` (`src/paths.ts`) resolves a `.data/sandbox` default,
mirroring `@agent-dev-lab/core`'s `resolveAdlSqlitePath` — an `ADL_SANDBOX_ROOT` env override,
else that path relative to `projectRoot`/`process.cwd()`. Pure path resolution; creating the
directory (`mkdirSync`) is still the caller's job.

## Testing

`bash/{process-channel,native-executor,asrt-executor}.test.ts` and
`web/{url-pattern,address-policy,fetch,fetch-url}.test.ts` are `node:test`-based (not `bun:test`) and run under both
`bun test` (the normal per-package suite) and `node --test` via `bun run test:node` from the repo
root — this package's process/spawn-heavy code is exactly where Bun and Node have been found to
disagree (see `notes/tool-sandboxing.md`), and `src/web/` is in the same category: it rests on
`fetch` with `redirect: "manual"`, streaming body reads and `AbortSignal` composition, all of which
the two runtimes implement separately.

`src/web/`'s tests never touch the network — see [`src/web/README.md`](./src/web/README.md)'s
"Testing" section for how the fixture-based end-to-end tests and the address-guard unit tests
divide the coverage.
