# `@agent-dev-lab/tools`: sandboxed file/bash/web-search tools + approval gate (design)

**Status:** `packages/tools` (`@agent-dev-lab/tools`, not yet published — see its `package.json`) exists with file-editing tools (`createFileTools`, `src/file/`), grep/glob (`createSearchTools`, `src/file/search.ts`), two bash `BashExecutor`s (`createAsrtBashExecutor` and `createNativeBashExecutor` — Linux only, see below) plus `createBashTool`, `src/bash/`, and `createFetchUrlTool` (`src/web/` — threat model and design live in that module's README). `BashExecutor.run` takes **argv** (no shell); `allowRead` on the native executor is the kernel read boundary search tools rely on. Still design-only: `createNativeBashExecutor`'s macOS backend, web search, and the approval gate. Last reconciled: **2026-09-11**. Read [`near-term-roadmap.md`](./near-term-roadmap.md) §2 first for why this exists (`packages/core/src/tools/` stays adapters + `ToolProvider`; built-in tools live here).

Related: [`future-extensions.md`](./future-extensions.md) (approval dispatcher sketch, pulled forward here), [`near-term-roadmap.md`](./near-term-roadmap.md) §2/§3 (tool package + AI-SDK-tool audit), AGENTS.md ("No Docker, no external services required" — a real constraint on the design below).

---

## Package shape

New workspace package **`packages/tools`** → `@agent-dev-lab/tools`, alongside `packages/core`. Depends on `@agent-dev-lab/core` (for `Tool`, `WorkflowContext`, `AdlError`); core does not depend on it. `packages/core/src/tools/` keeps the two adapters (`createToolFromAgent`/`createToolFromWorkflow`) plus the `ToolProvider`/`createToolProvider`/`resolveToolSource` primitives from §1 of `near-term-roadmap.md` — those live in core (not the new package) since `AgentImpl` itself resolves them on every call.

Rationale for a separate package rather than `core/src/tools/builtin/`: these tools carry a materially different trust boundary than the rest of the runtime (they execute model-directed actions against the host filesystem/process/network), and a project should be able to audit or omit that dependency entirely without touching `@agent-dev-lab/core`.

```
@agent-dev-lab/tools
├── file/          read, write, edit, grep, glob — jailed to a project root
├── bash/          sandboxed shell execution (`run(argv)`, `allowRead`)
├── web/           fetchUrl — one URL, SSRF guard, text/markdown (done)
├── web-search/    thin wrapper choosing provider-native search when available (not built)
├── approval/      ApprovalDispatcher interface + gate wrapper (from future-extensions.md)
└── index.ts
```

---

## Threat model (state this explicitly, since "sandboxed" is meaningless without one)

**In scope:** the model itself is the untrusted party. A tool-calling loop hands the model the ability to request file writes, shell commands, and network fetches; the model's choice of _arguments_ to those tools must be treated as adversarial input (prompt injection from tool results, a jailbroken or simply mistaken model, etc.).

**Out of scope (for v1 of this package):** a compromised host dependency, a malicious project author, or supply-chain attacks on `@agent-dev-lab/tools` itself. This package raises the bar against a misbehaving _model_; it is not a multi-tenant security boundary and should say so loudly in its docs.

This framing matters because it changes what "good enough" sandboxing means for each tool below — model-directed misuse needs to be _hard to reach accidentally and clearly logged/gated_, not necessarily withstand a human attacker with shell access to the same machine.

---

## Tool state per call, and a `ToolProvider` construct

**Historical motivation (now resolved by items 1–2 below):** `AgentDefinition.tools` used to be fixed at agent-definition time and merged with `AdlRuntimeConfig.tools`, with **no per-call override** — in contrast to `AgentRunInput`, which already let `stopWhen` and `outputSchema` vary per call (`packages/core/src/agent/types.ts`). `tools` was conspicuously missing from that list, and this package's original motivation made the gap concrete: a bash tool's sandbox (which root directory, which executor tier) is exactly the kind of thing that legitimately varies per run, not just per agent definition. `AgentRunInput.tools` and `ToolProvider` (below) closed this gap.

**What the AI SDK already gives us** (checked directly against the `ai@5.0.188` type defs, since this determines what's a wrapper vs. what ADL has to build itself):

- `tools` is already a plain parameter to `streamText` / `generateText` — nothing in the SDK forces tools to be fixed at some earlier "definition time." The constraint is entirely in ADL's own `AgentDefinition`/`AgentRunInput` types, not an AI SDK limitation.
- `prepareStep` (`ai`'s `PrepareStepFunction`) runs before each step of a multi-step tool loop and can return `{ model, toolChoice, activeTools, system, messages }` for that step — **this is a native, per-step mechanism for both model swapping and tool-subset narrowing**, directly relevant to both this doc and [`near-term-roadmap.md`](./near-term-roadmap.md) §1's model-switching item. `activeTools` narrows to a subset of `keyof TOOLS` from the top-level `tools` object — it cannot introduce tools that weren't already registered in that call's `tools`.

**What the AI SDK does _not_ give us**: a way to compute an entirely new tool set from arbitrary run-time context (which sandbox is configured, which dataset/experiment this run belongs to, per-tenant tool availability, etc.) before the call starts. `activeTools`/`prepareStep` only _select among_ a statically-assembled `tools` object — assembling that object from context is squarely ADL's job.

**Design — items 1 and 2 are done, item 3 is still to do:**

1. ✅ `AgentRunInput.tools` — added, resolved the same way `outputSchema`/`stopWhen` already are (per-call value wins over the agent definition's).
2. ✅ `ToolProvider` — added for the "arbitrary inputs → tools" case. Current shape (`packages/core/src/tools/provider.ts`):

   ```ts
   export type ExtendedToolProviderContext<ToolProviderContext = unknown> = {
     agentId: string;
     memoryScope: string;
     workflow?: AgentWorkflowScope;
   } & ToolProviderContextField<ToolProviderContext>; // plain optional key — see gotcha below

   // A true interface (not a bare function type), so a provider can be a class instance —
   // useful for constructor state (a connection pool, a cache) or implementing other
   // interfaces alongside this one.
   export interface ToolProvider<Tools extends ToolSet = ToolSet, ToolProviderContext = unknown> {
     // Optional introspection metadata, never read by the framework itself — see below.
     contextSchema?: z.ZodType<unknown, ToolProviderContext>;
     getTools(ctx: ExtendedToolProviderContext<ToolProviderContext>): Tools | Promise<Tools>;
   }
   ```

   `AgentDefinition.tools` and `AgentRunInput.tools` both accept `ToolSet | ToolProvider`; the runtime resolves it once per call (re-exported from `packages/core/src/tools/index.ts` — lives alongside the adapters, not under `agent/`, since it's conceptually a tools concern), merging `{ ...runtimeTools, ...definitionTools, ...inputTools }` before constructing `streamText`'s `tools`.

   `ToolProviderContext` (the context each `ToolProvider` receives) is a **plain type, never a schema** — the framework never parses or validates it. `getTools` gets the raw `AgentRunInput.toolProviderContext` value as-is; a provider that wants Zod validation/defaults calls `.parse()` itself, as the first line of its own `getTools`. `createToolProvider` takes a config object (not positional args, so future additions don't force reordering call sites) with `getTools` and an optional `contextSchema`:

   ```ts
   const sandboxSchema = z.object({ root: z.string().default("/tmp") });
   const tools = createToolProvider<z.input<typeof sandboxSchema>>({
     contextSchema: sandboxSchema,
     getTools: (ctx) => {
       const { root } = sandboxSchema.parse(ctx.toolProviderContext);
       return { bash: createBashTool({ root }) };
     },
   });
   ```

   (An earlier iteration put a `contextSchema` field on `AgentDefinition` instead, with the framework parsing on the provider's behalf. Reverted: the agent isn't the thing that needs a particular context shape, a tool provider is — putting the schema on `AgentDefinition` couldn't express "these two combined providers each need a different, independently-validated context.")

   `contextSchema` is optional, pure introspection metadata (e.g. for a settings UI to build a form from) — the framework never reads or parses it — but it's not a free-floating untyped blob either: typed `z.ZodType<unknown, ToolProviderContext>` (output unconstrained since nothing parses it; **input pinned to `ToolProviderContext`**, the exact raw shape `getTools` receives), so a schema describing a different shape than `getTools` actually expects is a compile error, not a silent drift. Verified via isolated repro before committing to this (a mismatched schema is rejected; `Tools` inference and `AgentDefinition.tools`, which is never widened, are both unaffected). `ToolProviderContext` appears fully generic here regardless of whether this position ends up widened: `AgentDefinition.tools` never widens at all, and `Agent.tools` (mirroring it verbatim) widens along with the rest of the agent into `AnyAgent` — see the gotcha below. `agent.tools.contextSchema` is how a caller (e.g. a dashboard) finds it without knowing which concrete agent it's looking at.

   `combineToolProviders({ name1: source1, name2: source2, ... })` merges several named `ToolSet | ToolProvider` sources into one — **keyed, not variadic**, so the combined context is **namespaced**: a caller passes `toolProviderContext: { name1: ..., name2: ... }`, and each source only ever sees its own slice under `ctx.toolProviderContext`, never a sibling's. This makes field-name collisions between independently-authored providers (a sandbox tool from one place, a web-search tool from another, neither aware of the other) structurally impossible — the alternative (flat-merging every source's context into one object via `UnionToIntersection`, the same way `Tools` gets merged) risks two unrelated providers silently colliding on a field name. `Tools` (the actual AI SDK tool names) are still merged flatly across all sources via `UnionToIntersection` over each source's contribution (see the file's own doc comments for the mechanism — the standard TS union-to-intersection idiom via contravariant function-parameter inference, not anything ADL-specific) — only `ToolProviderContext` is namespaced. The combined `contextSchema` mirrors this: `z.object({ name1: source1.contextSchema, ... })` for whichever sources declare one, same keys the runtime routing actually uses, so introspection and behavior never drift.

   **Real gotcha hit while implementing this (registry widening target has since changed — see update below):** making `ToolProviderContext` appear inside a function-parameter position that's part of a heterogeneous, widened registry is contravariant, and TypeScript's bivariant relaxation for interface methods breaks the instant a field's **presence** — not just its value type — is toggled by a conditional depending on that type parameter. Confirmed via isolated repro: `{ x?: T } : { x: T }` (presence differs) breaks widening; a conditional whose value type varies but whose key is _always_ present/optional does not. This was originally found against a registry widening to `Agent<unknown, ToolSet, unknown>`; the `adl.config.ts` `agents: []` registry now instead widens to `AnyAgent` (`Agent<any, any, any>`, exported from `packages/core/src/agent/types.ts`), and `any` in every slot sidesteps this whole class of bug — re-confirmed via the same repro against an `any`-parameterized target: no break, no cast needed. `AgentRunInput.toolProviderContext` still stays a **plain, always-optional field** end to end — enforcement of "this agent requires a context" is left entirely to whatever a `ToolProvider` does inside its own `getTools`, never a TS-level requiredness toggle — but that's no longer load-bearing for widening specifically, just the simpler design. `createToolProvider<Context>(fn)` remains the typed authoring helper bridging a fully-generic authoring-time context to the stored shape.

3. **Tie dangerous tools to a sandbox structurally, not by convention** (implemented). `createBashTool` takes `executor` as required; `createFileTools` takes `root` as required; `createSearchTools` takes `executor` + jail root. There is no zero-config unsandboxed default.

This section changes the shape of the `@agent-dev-lab/tools` API surface described below: every factory takes its safety-relevant config as a required argument, and the package's tools compose naturally with a `ToolProvider` for context-dependent construction, rather than assuming one static `tools` object per agent for the lifetime of the process.

---

## File-editing tools

**Implemented** — `createFileTools({ root, maxReadBytes?, maxWriteBytes? })` in `packages/tools/src/file/tools.ts`, built on `createFileJail` (`packages/tools/src/file/jail.ts`):

- `readFile({ path })`, `writeFile({ path, content })`, `editFile({ path, find, replace })` — went with plain find/replace rather than a diff format, requiring `find` to appear exactly once in the file (mirroring why this harness's own edit tool works that way) so an ambiguous edit is rejected rather than guessed at.
- **Jail:** every path resolves against `root` (`path.resolve` + `fs.realpath`) and must stay under the resolved root after symlink resolution — an absolute `requestedPath`, a `..` traversal, or a symlink planted inside the jail pointing outside it are all rejected (`AdlError("INVALID_INPUT", …)`), not silently clamped. Symlink resolution happens on the resolved candidate, not string-checked, so a symlink can't defeat the check. `root` itself is resolved (and symlink-checked) lazily on first tool call, not at `createFileTools` time, and cached after that. See `jail.test.ts` for the traversal/symlink/absolute-path cases this defends against.
- **Byte caps:** `maxReadBytes`/`maxWriteBytes` (default 1,000,000 each) refuse an oversized read or write rather than silently truncating.
- **Non-goals (unchanged):** no execute bit changes, no arbitrary metadata (chmod/chown) tools.
- **Known gap:** `writeFile`/`editFile` require the parent directory to already exist — this first increment doesn't create intermediate directories, since doing so safely (without a symlink defeating the jail partway through a multi-level `mkdir -p`) needs a level-by-level check not implemented yet.

### Grep / glob (`createSearchTools`)

**Implemented** — `packages/tools/src/file/search.ts`. Model-facing `grep` and `glob` build a fixed `rg` argv and pass it to `BashExecutor.run`; the pattern never goes through a shell. Paths are confined with `createFileJail` before argv construction. The subprocess read boundary is the executor's `allowRead` (when configured), not a kernel guarantee from the search tools themselves.

---

## Bash tool — the hard part

Isolation is the `BashExecutor` you pass in — there is no fallback if its prerequisites are missing. Three real tiers — this mirrors how [Mastra structures its `Sandbox` abstraction](https://mastra.ai/docs/sandbox/overview#localsandbox), which is worth taking as prior art since it's solving the same problem for a similar (agent tool-calling) audience — but unlike Mastra's own `nativeSandbox`, **there is no automatic fallback between them here.** If the configured executor's prerequisites aren't met, the tool refuses to run with a clear, specific error naming what's missing and how to install it — never a silent downgrade to a weaker tier.

### Tier 1 — bare subprocess (available, never selected automatically)

`Bun.spawn` / `child_process` with: `cwd` pinned to the configured root, a minimal `env` (allowlist, not the full parent `process.env` — this alone prevents a huge class of accidental secret leakage since ADL already loads `.env` files with API keys into `process.env`), a wall-clock timeout that kills the process group, and output size caps (truncate stdout/stderr past some limit so a runaway command can't exhaust memory piping output back to the model).

**What this does not do:** stop the command from reading/writing anywhere the invoking OS user can reach, opening network connections, or spawning further processes. It is a guardrail against _accidental_ damage and against trivially reading the parent's full environment — not a security boundary against a determined adversary. Mastra's own docs say almost exactly this about `LocalSandbox`'s default mode: _"runs commands on the application host by default and isn't isolated or secure."_ This has to be documented up front, not discovered later. A project can explicitly opt into this tier (e.g. a CI container with no sandboxing primitives available), but the package never picks it silently on a tier-2 executor's behalf.

### Tier 2 — native OS sandbox (the default)

Two executors implement this tier, both conforming to the same `BashExecutor` interface below. **ASRT is the preferred default; the direct-primitive executor is an explicit, non-default alternative** for projects that don't want ASRT's network-proxy layer or npm dependency.

#### `@anthropic-ai/sandbox-runtime` (ASRT) — preferred, implemented

**Implemented** in `packages/tools/src/bash/asrt-executor.ts` (`createAsrtBashExecutor`) and
`packages/tools/src/bash/tools.ts` (`createBashTool`) — see those files' doc comments and
`packages/tools/src/bash/asrt-executor.test.ts` (real integration tests against actual
`bwrap`/`socat`/`rg`, no mocking, including a subprocess-isolated missing-dependencies check).
Uses `SandboxManager.wrapWithSandboxArgv()` (not `wrapWithSandbox()`'s string form) so the
result is spawned directly (`spawn(argv[0], argv.slice(1), { env })`) with no extra shell
layer. Two things learned only by implementing this, beyond what evaluation below found:

- `SandboxManager` is a **single process-wide singleton** — module-scoped state in ASRT's own
  implementation (not a class), so there's no way to run two independently-configured sandboxes
  in one process, and its `initialize()` is itself idempotent: once it has succeeded once,
  every later call — including one with a _different_ `{ allowWrite, denyRead, denyWrite,
allowedDomains, deniedDomains }` from a second `createAsrtBashExecutor` — just awaits the same
  already-resolved initialization and silently keeps the first config. `createAsrtBashExecutor`
  doesn't fight this; whichever instance's `run()` executes first wins the process-wide config,
  and every other instance transparently shares it. `maxOutputBytes` (this package's own
  truncation cap, not part of ASRT's config) is the one thing that can safely differ between
  instances sharing the same underlying sandbox. Construct one instance per distinct config
  actually needed, and prefer one shared instance per process when configs would otherwise
  match, since a "second" config never really takes effect.
- `SandboxManager.checkDependencies()` returns a structured `{ errors, warnings }` _before_
  `initialize()` is ever called — no need to catch-and-parse `initialize()`'s own thrown
  error; `createAsrtBashExecutor` calls it proactively and appends per-platform install hints
  (`apt`/`dnf`/`pacman`/`brew`) to whichever of `bwrap`/`socat`/`ripgrep` it names as missing.

**Streams progress, not just a final result.** `BashExecutor.run()` is an `AsyncGenerator` —
zero or more `{ done: false, stdout, stderr, truncated }` snapshots (cumulative, not a delta)
per `stdout`/`stderr` chunk while the command runs, then one final `{ done: true, ...,
exitCode }`. This matches the AI SDK's own tool-streaming contract exactly (`execute` can
return an `AsyncIterable<OUTPUT>` — every yielded value becomes a `preliminary` tool-result,
the last becomes the real one; see `packages/core`'s `AgentToolResultEvent` doc comment and its
`preliminary` field, added specifically to support this), so `createBashTool`'s `execute` just
returns `options.executor.run(...)` directly with no wrapping. The push (child-process events)
→ pull (`for await`) bridge is `@agent-dev-lab/core`'s `createAsyncChannel` — previously a
private detail of `agent.stream()`, promoted to a public export for exactly this kind of use.

[Evaluated directly, not just read about](https://github.com/anthropic-experimental/sandbox-runtime) — 5,139 GitHub stars, actively developed (pushed same-day as this evaluation), Apache-2.0, and it's the actual sandboxing mechanism behind Claude Code in production. Uses `sandbox-exec` on macOS, Bubblewrap on Linux, and an alpha Windows path (dedicated `srt-sandbox` local user + WFP egress fence, needs a one-time elevated setup step — **not in scope for this package's initial Windows support, which is "unsupported" full stop, matching the file tools' current stance**). Covers both filesystem (deny-then-allow reads, allow-only writes, glob patterns on macOS, literal paths only on Linux) _and_ network isolation (domain allow/deny lists, optional TLS termination for request-level filtering) — network egress filtering was a non-goal earlier in this doc; ASRT gives it to us essentially for free, so it's worth reconsidering that non-goal once this ships, though not required.

**Verified by hand in this repo's own dev environment** (Linux x86_64, `bwrap`/`socat`/`rg` already present, no Ubuntu-24.04-style userns restriction): the library API (`SandboxManager.initialize(config)` → `wrapWithSandbox(command)` → `spawn(wrapped, { shell: true })` → `SandboxManager.reset()`) correctly ran a sandboxed command, blocked an unallowlisted domain (`curl` got `CONNECT tunnel failed, response 403` through the proxy, default-deny confirmed), and enforced filesystem writes (wrote to an `allowWrite` path, got `Read-only file system` outside it). With `bwrap`/`socat`/`rg` all hidden from `PATH`, `SandboxManager.initialize()` threw synchronously with `Sandbox dependencies not available: ripgrep (rg) not found, bubblewrap (bwrap) not installed, socat not installed` — ASRT already aggregates and names every missing prerequisite in one message; our `BashExecutor` just needs to catch that and append install commands (below), not reimplement the detection.

**Use the library API (`SandboxManager`), not the `srt` CLI binary** — confirmed a real gotcha in the CLI: passing a wrapped command's own short flags as separate argv elements (e.g. `srt curl -sS ...`) gets misparsed as `srt`'s _own_ `-s`/`--settings` flag by its `commander`-based parser (`-sS` read as `-s S`, "Could not load settings from S"). The CLI's own `-c "<command string>"` flag avoids this, but going through `SandboxManager.wrapWithSandbox()` directly sidesteps the whole class of argv-parsing ambiguity, which matters since our tool's command string comes from the model, not a human typing a single well-formed shell invocation.

**Real cost, decided to accept:** on Linux this needs three external OS packages — `bubblewrap`, `socat`, `ripgrep` (`apt-get`/`dnf`/`pacman install bubblewrap socat ripgrep`) — and on Ubuntu 24.04+ specifically, `kernel.apparmor_restrict_unprivileged_userns` (which strips capabilities from unprivileged user namespaces by default on those releases) has to be relaxed for Bubblewrap's own sandboxing to have the capabilities it needs. macOS only needs `ripgrep`. **`AGENTS.md`'s "no Docker, no external services required" is a `packages/core` constraint** — `@agent-dev-lab/tools` is a separate, optionally-installed package, and these are host OS packages, not services; framed the same way `optionalDependencies` are in npm's own sense — present, you get a real kernel-enforced sandbox; absent, the bash tool refuses to run with the aggregated error above (enriched with the apt/dnf/pacman/brew install lines) rather than silently running unsandboxed. Marked "Beta Research Preview" upstream (APIs/config format may evolve) — worth pinning an exact version rather than a caret range given that.

#### Direct `bwrap` / `sandbox-exec` invocation — alternative, non-preferred

The original plan for this section, kept available for projects that want the simpler direct-OS-primitive path without ASRT's network-proxy layer or npm dependency (mirrors Mastra's `LocalSandbox` and, more distantly, [`agent-jail`](https://github.com/Michaelliv/agent-jail) — evaluated and passed over for the _default_ role: 11 GitHub stars, last pushed months ago, single maintainer, no Windows path at all via its own `package.json` `os` field restriction — too unproven to be the primary security boundary here, though its zero-external-package install story, via npm `optionalDependencies` shipping one prebuilt binary per platform, is a good pattern worth remembering if this space matures):

- **Linux — implemented** (`packages/tools/src/bash/native-executor.ts`, `createNativeBashExecutor`): [Bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) directly — `--ro-bind / /` (the whole host, read-only, so ordinary commands just work) plus `--bind` per `allowWrite` path (read-write) and a hide per `denyRead` path, `--unshare-all` with `--share-net` added back only if `allowNetwork` (all-or-nothing, no per-domain allowlist). Verified directly against real `bwrap` in this repo's dev environment — see `native-executor.test.ts` — not assumed from the flag names. Two things only found by testing, not by reading `bwrap --help`:
  - **Bind-mount order determines what wins at an overlapping path** (later args override earlier ones) — `allowWrite` must come after the base `--ro-bind / /`, and `denyRead` must come after `allowWrite`, so an explicit deny beats a broader allow rather than the other way around.
  - **Hiding a `denyRead` _file_ needs a different flag than hiding a directory.** `--tmpfs <path>` (right for a directory) turns an existing _file_ path into an empty _directory_ instead — confusing for anything that checks the path's type (`stat`, a symlink check, ...). Detect the existing type first: `--tmpfs` for a directory or a path that doesn't exist yet, `--ro-bind <an-empty-regular-file> <path>` for an existing file. `/dev/null` doesn't work as that empty-file source — bound outside `/dev` it read as `Permission denied` rather than empty, since `--dev /dev`'s fresh dev mount doesn't carry device-node semantics to a bind target elsewhere; a real empty regular file (created once, lazily, and reused) works cleanly.
  - (Also worth knowing, not itself a gotcha: killing the outer `bwrap` process with `SIGKILL` cleanly tears down the whole sandboxed process tree — `--die-with-parent` plus `--unshare-all`'s implied PID namespace means no orphaned grandchildren survive, verified with a `sleep` + kill + `pgrep` check.)
  - **Env defaults to a minimal safe subset** (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`), not the full `process.env` — mirrors this doc's original tier-1 concern about leaking secrets ADL's own `.env` loading puts there; override via `NativeBashExecutorOptions.env` if a project needs more.
  - **Checking `bwrap`'s presence can't use `spawn`/`spawnSync`'s own PATH resolution** — confirmed a real Bun/Node discrepancy: under Bun, `spawnSync("bwrap", ..., { env: { PATH: "" } })` still resolved a real `bwrap` from the _ambient_ process PATH despite the empty override (Node's `spawnSync` correctly fails to resolve in the same test). `checkBwrapAvailable` walks `process.env.PATH` manually instead, which is deterministic across both runtimes.
- **macOS — not implemented.** Seatbelt (`sandbox-exec`) would need a hand-written SBPL profile, and this development environment has no Mac to build or verify one against — shipping an unverified low-level sandboxing profile is worse than not shipping one at all. `createNativeBashExecutor` throws a clear "not implemented yet" error on `darwin` rather than silently doing nothing; use `createAsrtBashExecutor` there instead until someone with Mac access builds and verifies this.

No built-in network egress filtering here (unlike ASRT) — a project wanting that on this executor layers its own `BashExecutor` wrapper or accepts all-or-nothing network access.

### Tier 3 — container/VM boundary (opt-in)

Docker, gVisor, Firecracker, E2B, or similar remote/container backends (Mastra also offers Daytona/E2B/Vercel/Railway-backed sandboxes) for projects that want an even stronger boundary than tier 2 — full filesystem/network isolation, independent of the host's kernel, or scaling execution off the application server entirely. **This should not be the default** — it would contradict the zero-external-dependency principle that's been true of ADL since 0.1.0, and it adds a real operational dependency (image builds/pulls, daemon or remote-account availability) that most research/dev usage doesn't need. Reserve it for projects that explicitly opt in.

### Design: pluggable executor, not a hardcoded implementation

**Implemented** — `packages/tools/src/bash/executor.ts`. Streams, rather than the
single-`Promise` shape originally sketched here — see the ASRT section above for why:

```ts
interface BashExecutor {
  run(
    argv: readonly string[],
    opts: BashExecutorRunOptions,
  ): AsyncGenerator<BashExecutorUpdate, void, void>;
}
// BashExecutorUpdate = BashExecutorProgress ({ done: false, stdout, stderr, truncated })
//                    | BashExecutorResult   ({ done: true, stdout, stderr, exitCode, truncated })
```

The bash tool wraps `["/bin/bash", "-c", command]`; `createSearchTools` never puts a model-supplied pattern through a shell. Empty argv throws (`INIT_FAILED`), it is not a no-op. `allowRead` on `createNativeBashExecutor` is an allow-list bound into the mount namespace (plus `allowWrite` and a small set of system paths); omitted, this executor still ro-binds all of `/` — historical behaviour, not a kernel guarantee for recursive readers like `rg`.

`createAsrtBashExecutor` and `createNativeBashExecutor` (Linux only — see above) are both
implemented; a bare-subprocess tier-1 executor is still design-only, not yet built. The spawn +
stream-into-a-channel + truncate + timeout-kill logic turned out to be identical between the
two real executors regardless of how each builds its `argv`/`env` — factored out once into
`packages/tools/src/bash/process-channel.ts`'s `runArgvIntoChannel`, which both call. A
non-streaming executor (the still-unbuilt tier-1 one) can just yield the final result alone and
satisfy the same interface, since that's the degenerate one-yield case — though in practice,
reusing `runArgvIntoChannel` makes streaming the same amount of work as not streaming, once you
have `argv`/`env`. `createBashTool({ executor, cwd,
timeoutMs? })` in `packages/tools/src/bash/tools.ts` is the model-facing tool: it takes a
`BashExecutor` explicitly — never picks one on its own, no unsandboxed default — and its
`execute` returns `options.executor.run(...)` directly, no wrapping generator needed, since the
executor's return type already matches the AI SDK's tool-streaming contract. A non-zero exit
code is data on the final result, not a thrown error (a failing command is meaningful
information for the model; `execute` only throws for infrastructure failures like a missing
sandbox prerequisite). A project would pick an executor explicitly through the same config
surface tier 3 uses, the same shape as the `ApprovalDispatcher` pattern below. No executor
silently substitutes for another.

**Also worth borrowing from Mastra's tool API shape** (not just the executor): rather than one synchronous run-to-completion tool, Mastra exposes `execute_command` / `get_process_output` (with `tail` and `wait: true`) / `kill_process` as separate tools, so a model can start a long-running command, poll or tail its output, and kill it — useful for dev servers or long builds. Worth doing eventually, but it's materially more complex (needs a process registry keyed by call/session) than the synchronous version above — treat it as a fast-follow, not part of the shipped bash tool.

### Tool providers, environment introspection, and an AI-based safety check

**Implemented** — `createBashToolProvider` (`src/bash/provider.ts`), `createFileToolProvider`
(`src/file/provider.ts`), `createWorkspaceToolProvider` (`src/workspace/`). `createFileTools`/
`createBashTool`/`createAsrtBashExecutor`/`createNativeBashExecutor` all still exist unchanged —
these are `ToolProvider` wrappers on top of them, for projects that want `cwd`/`root`/
`timeoutMs`/byte caps set per `agent.run()` call instead of fixed when the agent is built.

- **Per-call config via `ToolProviderContext`, not a runtime flag.** Each provider's context
  (`{ cwd?, timeoutMs? }` for bash; `{ root?, maxReadBytes?, maxWriteBytes? }` for file; the
  union of both, sharing one `cwd`, for workspace) overrides the matching constructor option,
  independently per field. **This is a trust boundary, not a restriction**:
  `toolProviderContext` is set by the workflow/host calling `agent.run()` — never by the model
  directly (a model can only reach it if a workflow author deliberately routes model output
  into it, which is that author's own choice, not something this layer can or should prevent).
  So a context-provided `root`/`cwd` is free to point anywhere the caller trusts — the file
  jail (pure userland path-checking, per `jail.ts`'s own doc comment) fully re-scopes to it,
  no artificial "must be under some default" limit. Bash is asymmetric for a real, inherent
  reason, not a restriction this layer imposes: the `BashExecutor`'s own OS-level permissions
  (`allowWrite`/`denyRead`/network) are fixed at executor-construction time — confirmed
  `SandboxManager.initialize()` is idempotent, so a later call with a different config is
  silently ignored (see `asrt-executor.ts`'s doc comment) — so pointing `cwd` outside the
  executor's `allowWrite` still fails at the OS level regardless of what context says.
- **`createWorkspaceToolProvider` composes the atomic providers rather than reimplementing
  jail/bash construction**, translating its one shared `cwd` into each one's own field name.
  Deliberately not `combineToolProviders` (`packages/core`): that namespaces context per
  source, which would let the file root and bash cwd drift apart on the exact thing meant to
  be shared. This is the structural answer to "differentiate command-only sandboxes from
  workspace tools that have everything for working on a codebase in a folder" —
  `createBashToolProvider` alone for the former, `createWorkspaceToolProvider` for the latter
  (the Mastra-style combined surface) — not a runtime flag on one implementation.
- **A real TypeScript gotcha found building this**: `Tools` in `ToolProvider<Tools extends
ToolSet>` requires an implicit index signature, and only a plain `type X = { ... }`
  object-literal type alias gets one — an `interface`, even only _indirectly_ involved (via
  `interface X extends Y` or `type X = Y & {...}` where `Y` is an interface), loses it, and
  fails with "Index signature for type 'string' is missing." Verified directly with a minimal
  repro before touching the real code. `BashProviderTools`/`FileProviderTools`/`WorkspaceTools`
  are therefore plain object-literal aliases referencing the existing `BashTools`/`FileTools`
  interfaces' fields via indexed access (e.g. `bash: BashTools["bash"]`) rather than
  `extends`/`&` — keeps one definition of each tool's shape without tripping the constraint.
- **`resolveDefaultSandboxRoot(projectRoot?)`** (`src/paths.ts`) mirrors `@agent-dev-lab/core`'s
  `resolveAdlSqlitePath` exactly: pure path resolution (no FS side effects — `mkdirSync` stays
  the caller's job, same split as that function's own `mkdirSync` happening at DB-open time,
  not in the resolver), `ADL_SANDBOX_ROOT` env override (absolute as-is), else
  `.data/sandbox` relative to `projectRoot` (or `process.cwd()`). Matches the SQLite store's
  own `.data/` convention.
- **Describe-env tools, named for their actual scope** — `describeBashEnv`
  (`createBashToolProvider`), `describeFileEnv` (`createFileToolProvider`), and
  `describeWorkspaceEnv` (`createWorkspaceToolProvider`, merging both) so the model can
  proactively learn its own constraints (cwd, writable/denied paths, network access, byte caps)
  instead of discovering them only by hitting a denial — and can then tell the user precisely
  what permission it would need. **Deliberately not called `describeEnvironment`**: each one
  only covers what `@agent-dev-lab/tools`' own bash/file sandbox manages, not the agent's whole
  environment — a project may attach other tools with their own network access (a web-search
  tool, say) that these know nothing about. A generic name would imply a completeness the tool
  can't back up; each description string says so explicitly too. Backed by a new **required**
  `BashExecutor.describe(): BashExecutorDescription` method — both `createAsrtBashExecutor` and
  `createNativeBashExecutor` already hold their resolved config in closure, so `describe()` just
  returns it, no new computation. (One honest caveat: `describe()` reports the instance's _own_
  configured options, which is the config actually enforced _unless_ a different
  `createAsrtBashExecutor` already initialized the process-wide `SandboxManager` first — already
  called out above as an anti-pattern to avoid, not worth extra complexity here to detect.)
- **Agent-based bash safety check, via a `Workflow`** — `createBashToolProvider`'s optional
  `safetyCheck` option is itself a `Workflow<{ command, cwd }, { safe, reason }>`
  (`BashSafetyCheckWorkflow`), layered on top of the OS-level sandbox specifically because a
  filesystem/network jail can't catch non-filesystem dangerous intent (fork bombs, resource
  exhaustion, destructive-but-permitted operations). A `Workflow`, not a bare `Agent` — plain
  async TypeScript, so the check can call one agent, chain a cheap heuristic pre-filter before
  an LLM judge, retry, or combine several checks, not just one chat-style turn. Concretely
  typed (not the `Workflow<unknown, unknown>` widening a heterogeneous registry like
  `AdlProjectConfig.workflows` needs) since this is one fixed shape — the compiler checks a
  passed-in workflow's input/output for real. No manual schema re-validation at the call
  site: `workflow.run(...).result` is already guaranteed by the runtime to match
  `outputSchema` before it resolves (a mismatch rejects instead), so only a rejected `.result`
  needs handling — **fails closed**: any rejection (a thrown error inside the workflow, or an
  output-schema mismatch) is treated as unsafe, matching this package's "never silently
  degrade" posture. An unsafe verdict yields one final `{ exitCode: 1, stderr: "Blocked by
safety check: <reason>", ... }` instead of running the command — a denial is data for the
  model, not an uncatchable tool-call error, same as any other non-zero exit code. Explicitly
  scoped narrower than the `ApprovalDispatcher` sketch below: that's primarily a _human_-approval
  API (a separate, later piece of work); this is automated, bash-only, and doesn't touch that
  interface at all.

### Testing: Node as the reference runtime for process/sandbox code

The rest of ADL runs its tests under `bun test`, but the bash executors are exactly the kind of
code where Bun and Node have been found to disagree (see the `spawn` PATH-resolution gotcha
above) — so `packages/tools/src/bash/{process-channel,native-executor,asrt-executor}.test.ts`
are written against `node:test` + `node:assert/strict` instead, runnable under **both**
`bun test` (still part of the normal per-package suite) and `node --test` via the dedicated
`test:node` turbo task (`bun run test:node` from repo root). This reflects a repo-wide decision
to prioritize Node as the reference runtime going forward rather than treating Bun and Node as
equally-supported targets indefinitely — Bun stays the dev/monorepo tool (install, `bun run
dev`, most of the test suite), but process-level code gets verified against Node directly
instead of trusting that Bun's behavior matches it.

Two things only surfaced by actually running this under `node --test` (which — unlike
`bun test` — waits for a natural process exit instead of force-ending the run):

- **`SandboxManager` (ASRT) never lets a process exit on its own without an explicit
  `SandboxManager.reset()` call.** ASRT's own docs describe `reset()` as optional, "happens
  automatically on process exit" — that did not hold up: a plain Node script that finishes all
  its own work and calls nothing else hangs indefinitely, most likely because `SandboxManager`'s
  proxy bridge processes/sockets are never unref'd. `bun test` masked this completely — it
  force-ends the whole process at suite completion regardless of open handles, so no hang was
  ever visible under it, but every one of `SandboxManager`'s child processes leaked silently
  instead (confirmed: dozens of orphaned `socat` bridges accumulated across a session's worth of
  `bun test` runs). `asrt-executor.test.ts` now calls `SandboxManager.reset()` in its `after()`
  hook to fix this for the test process itself. **This is not just a test artifact** — any real
  host application (a long-running CLI command, a server process) that constructs a
  `createAsrtBashExecutor` needs to call `SandboxManager.reset()` on its own shutdown path too,
  or it will neither exit cleanly nor release these processes. `asrt-executor.ts`'s doc comment
  now says so explicitly; there's no framework-level shutdown hook for this yet (open question —
  see near-term roadmap).
- **Node's ESM resolver is stricter than Bun's**: relative imports need explicit `.ts`
  extensions (`allowImportingTsExtensions` added to `packages/tools/tsconfig.json`), and
  `@agent-dev-lab/core` must already be built (`dist/`, via the `default` export condition) for
  `node --test` to resolve it at all — Node can't fall back to `core`'s source the way Bun's
  `bun`/`development` export conditions let it. `turbo.json`'s `test:node` task declares
  `dependsOn: ["^build"]` for this reason.

---

## Web search tool

**Audit done** — see `packages/tools/README.md`'s "Provider-native tools" table for the full
allowlist (checked against actual installed types, not assumed): OpenAI's `openai.tools.webSearch()`
runs entirely server-side (search + page fetch both happen on OpenAI's infra) and is already
usable with this repo's default `openai(modelId)` factory — no sandboxing concern on ADL's side
at all, since ADL never executes the fetch itself. **Prefer provider-native search whenever the
configured model supports it**, and only fall back to a custom implementation (project-supplied
fetch + an allow/deny domain list + response size caps) for providers/models without one. The
custom fallback's "sandboxing" is really just: no arbitrary redirects to internal/private IP
ranges (SSRF guard), and treating fetched content as untrusted text, never executed. That same
table also confirms `fileSearch` (OpenAI-hosted vector-store retrieval) is **not** a substitute
for either this or the `fetchUrl` tool (`src/web/`), despite the name looking like a match, and that
`localShell` is **not** a substitute for `createBashTool` (schema-only, still client-executed).

---

## Approval / permission gate

Sandboxing without a gate is binary — always-allow or always-deny — which is exactly what `future-extensions.md` already anticipated with its `ApprovalDispatcher` sketch. Pulling that forward:

```ts
// mirrors future-extensions.md's sketch, scoped to tool calls for now
interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
}

interface ApprovalRequest {
  toolName: string;
  input: unknown;
  agentId?: string;
  workflowRunId?: string;
}
```

- Each tool in this package wraps its `execute()` with a check: if the project's `adl.config.ts` supplies an `approvals.dispatcher`, call it before running; if none is supplied, default to **auto-approve** (so `bun test` / headless CI / quick playground use isn't blocked) but log a warning that no approval gate is configured — visibility over silently-permissive defaults.
- The inspection UI is the natural place to implement an interactive dispatcher (block on an in-app "Allow / Deny" button) once this exists — that's UI work, out of scope for this doc, but the dispatcher interface should be designed so the UI's future implementation doesn't need changes to this package.
- This only covers the tool-call surface, not `ctx.requestApproval` (workflow-level pauses) — that half of `future-extensions.md` remains deferred (it needs persisted run state / resume, which is a separate, larger piece of work).

---

## Config surface (sketch)

```ts
// adl.config.ts
import { createFileTools, createBashTool, createWebSearchTool } from "@agent-dev-lab/tools";

export default {
  // ...
  approvals: { dispatcher: myDispatcher }, // optional; omit = auto-approve + warn
  tools: {
    ...createFileTools({ root: "./workspace" }),
    ...createBashTool({ root: "./workspace", timeoutMs: 30_000 }),
    ...createWebSearchTool(), // picks provider-native search when the model supports it
  },
};
```

Reuses the existing "shared `tools` in config" mechanism (`AdlRuntimeConfig.tools`, already ✅ per `v1-scope.md`) rather than inventing a new registration path.

---

## Open questions (resolve before implementation)

1. **Executor pluggability for bash:** confirmed direction above (interface + default subprocess impl) — still need to decide the exact shape of resource limits (is a wall-clock timeout enough, or do we also want a CPU/memory cap via `ulimit`/cgroups where the OS supports it?).
2. **Where does `fileRoot`/bash `cwd` come from?** Likely the ADL project root by default, override via config — needs to be unambiguous so a model can't reason its way to a path outside it via relative traversal.
3. **Does the approval dispatcher apply per-tool-call or per-tool-type?** (e.g. approve "bash" once for a whole conversation vs. every invocation) — affects how annoying this is to actually use day-to-day.
4. **Auto-approve default:** confirm the "warn but don't block" default above is the right call for a research/dev tool, versus defaulting to deny-by-default and requiring explicit opt-in. Leaning toward warn-and-allow to match the rest of ADL's low-friction-by-default posture, but this is a real security-vs-ergonomics tradeoff worth a second opinion before shipping.

---

## Non-goals (this doc)

- A general-purpose plugin/extension marketplace — this is three specific tool families, not an extensibility framework.
- Multi-tenant / untrusted-user isolation (see threat model above) — Option B exists for projects that need it, but this package doesn't ship or manage that infrastructure.
- Network-level sandboxing beyond the web-search SSRF guard (no general egress firewall) — a project that needs that layers it on top via its own `BashExecutor`/environment.
