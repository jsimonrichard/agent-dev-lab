# @agent-dev-lab/tools

Sandboxed file/bash/web-search tools for `@agent-dev-lab/core` agents. Design doc:
[`notes/tool-sandboxing.md`](../../notes/tool-sandboxing.md).

**Status: not yet published.** `private: true`, changeset-ignored (see `.changeset/config.json`)
until the package is ready to ship.

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

- `src/web/` — `createFetchUrlTool({ allowedUrls?, timeoutMs?, maxResponseBytes?, maxRedirects? })`:
  a `fetchUrl` tool that retrieves **one** URL and returns its body as readable text/markdown.
  The sibling of web search, not a replacement — search _finds_ pages, this _reads_ one. Web
  search itself is deliberately not built here (see the provider-native table above).

  Almost all of this module is the threat model rather than the fetch:
  - **Address guard (`address-policy.ts`)** — an **allowlist**, checked against
    [`ipaddr.js`](https://github.com/whitequark/ipaddr.js)'s `range()` classification: loopback,
    private, link-local (cloud metadata at `169.254.169.254` / `fe80::`), unique-local, CGNAT,
    multicast, broadcast, reserved, IPv4-mapped and 6to4/Teredo/NAT64 addresses are all refused,
    as is anything that fails to parse — a range nobody thought of is denied by default rather
    than allowed by omission. Two checks, deliberately different in scope:
    - **A literal IP address in the URL's hostname** (no DNS involved) is checked **regardless
      of scheme** — `http://127.0.0.1/x` and `https://127.0.0.1/x` are both refused.
    - **A domain name's resolved address** is checked **only for `http:`**, not `https:`. This
      asymmetry is deliberate, not an oversight: for `https:`, TLS's own hostname verification is
      already a real backstop against a domain resolving into a private address — the connection
      still needs a certificate that validates for the attacker's own hostname, and an internal
      service that's actually reachable essentially never has one. For `http:`, there's no TLS at
      all, and this is exactly how the highest-value real target — cloud metadata services — is
      served: plain, unauthenticated HTTP. A hostname answering with one public and one private
      address is refused outright either way, since the connection, not this code, picks which
      one it uses.

      **Why block non-public addresses by default at all, rather than leave it to a project's own
      network layer:** this is standard practice for an agent-facing fetch tool specifically (as
      opposed to a general-purpose HTTP client, which typically has no opinion here) — see
      [OpenClaw's `tools.web.fetch.allowPrivateNetwork`](https://github.com/openclaw/openclaw/issues/39604)
      (default `false`, private-network access opt-in, the same shape `allowedUrls` takes here),
      [Wiz's SSRF prevention guide](https://www.wiz.io/academy/application-security/server-side-request-forgery),
      and [CrawlForge's write-up on SSRF in MCP servers reaching cloud metadata](https://www.crawlforge.dev/blog/mcp-server-ssrf-cloud-metadata-security).
      The bracket-stripping and IPv4-mapped-IPv6 handling here specifically defend against
      [CVE-2026-80347](https://www.sentinelone.com/vulnerability-database/cve-2026-80347/), a real
      SSRF bypass found in a comparable community MCP fetch server — not a hypothetical edge case.
      [`request-filtering-agent`](https://github.com/azu/request-filtering-agent) is the most
      actively-maintained comparable npm library; it wasn't adopted here because it only works
      with `http.Agent`-based clients (not WHATWG `fetch`, which this tool is built on) and its
      own docs don't state whether it handles the IPv4-mapped-IPv6 case above.

  - **Re-checked after every redirect** — `fetch` is called with `redirect: "manual"` and the hops
    are followed by hand, so the guard runs against each `Location` _before_ it is requested. A
    redirect landing on `169.254.169.254`, written literally in `Location`, is the case this
    exists for.
  - **`allowedUrls`** — URL patterns exempt from both address checks, **empty by default**. This
    is the only way to reach a literal non-public address on purpose (a test fixture), or an
    `http:` domain that resolves privately on purpose (a company-internal service with no TLS),
    and it is matched per hop against `scheme://host:port/path` (no query, no fragment — see
    `urlMatchCandidate`'s doc comment), so an exempt origin cannot redirect sideways into another
    service on the same machine. There is deliberately no option that turns the guard off. Each
    entry is a glob **string** or a `RegExp`:
    - A glob is a small, deliberately narrow language, not a general glob engine (`url-pattern.ts`
      explains why): literal characters match themselves, `*` matches one path segment, `**`
      matches anything including `/`. `http://intranet.example:8080/**` allows a whole origin
      (equivalent to the old host-only allowlist); `http://intranet.example:8080/wiki/*` scopes
      the exemption to one directory — precision plain `hostname:port` allowlisting couldn't
      express.
    - A `RegExp` is matched over the **whole** candidate regardless of its own `^`/`$` anchors —
      an omitted anchor fails closed instead of silently matching as a substring.
    - `describeWebEnv` reports each entry as a display string (`String(pattern)`), since a raw
      `RegExp` serializes to `"{}"` under `JSON.stringify` and would otherwise silently lose the
      pattern once an AI SDK turn serializes the tool result.
  - **Untrusted content** — the response is never executed, evaluated or resolved; `<script>`,
    `<style>`, `<noscript>`, `<iframe>`, `<object>`, `<embed>`, `<template>` and `<svg>` are
    dropped with their contents before conversion, and the tool description tells the model the
    content is third-party data to quote, never instructions to follow. Same posture
    `createBashTool` takes toward command output.
  - **Byte cap and timeout** — the body is read a chunk at a time and the stream is cancelled the
    moment `maxResponseBytes` is reached, so an oversized _or endless_ response is never buffered
    past the cap; one `AbortSignal` bounds DNS, every hop and the body read together, composed
    with the agent run's own signal. Defaults mirror the other modules': 1 MB and 30s.
  - **Text only** — HTML becomes markdown, other text types are decoded as-is, and binary or
    unlabelled content is **refused by name** rather than decoded into garbage. A non-2xx status,
    by contrast, is returned as data, the same way `createBashTool` reports a non-zero exit code.

  See `address-policy.ts`'s doc comment for the `http:`-only domain-resolution check's own
  limitation (DNS rebinding — a userland check, not a transport-enforced one, for the same reason
  `createFileJail` documents a symlink TOCTOU — and one this package's own research found is
  handled the same way, not more strictly, in comparable tools: the documented mitigation for
  this ["refuse to follow redirects whose target resolves to a private network"](https://www.crawlforge.dev/blog/mcp-server-ssrf-cloud-metadata-security)
  is exactly the resolve-and-classify-per-hop check here, not full connection pinning) and
  `extract.ts`'s for why `turndown` was chosen over the alternatives, plus what it does _not_ do
  (it converts markup; it does not strip nav/footer boilerplate).

  **Dependencies added:** `turndown` (+ its one dependency `@mixmark-io/domino`) and `ipaddr.js`
  — three runtime packages, no native builds. Called out because this package is meant to be
  independently installable; the seven-package `@mozilla/readability` + `linkedom` option was
  rejected on that basis.

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
`web/{url-pattern,address-policy,fetch-url}.test.ts` are `node:test`-based (not `bun:test`) and run under both
`bun test` (the normal per-package suite) and `node --test` via `bun run test:node` from the repo
root — this package's process/spawn-heavy code is exactly where Bun and Node have been found to
disagree (see `notes/tool-sandboxing.md`), and `src/web/` is in the same category: it rests on
`fetch` with `redirect: "manual"`, streaming body reads and `AbortSignal` composition, all of which
the two runtimes implement separately.

`src/web/`'s tests never touch the network. The SSRF policy is unit-tested with an injected
hostname resolver, and the end-to-end tests run against a `node:http` fixture server on an
ephemeral loopback port, whose origin is exempted via `allowedUrls` (a `${origin}/**` glob). Because that exemption is
matched per redirect hop, a fixture response redirecting to `169.254.169.254` still lands on a
non-exempt hop and is refused — so the post-redirect guard is covered end to end without a real
host, and the purely-public case (public host → private redirect target, nothing exempted) is
covered as a unit alongside it.
