# `@agent-dev-lab/tools`: sandboxed file/bash/web-search tools + approval gate (design)

**Status:** Design doc — no code yet. This is the "needs a decision before code" item flagged as P0 in [`near-term-roadmap.md`](./near-term-roadmap.md#2-standard-tool-library-file-editing-bash-web-search--sandboxed). Read that section first for why this exists and what's already confirmed about the current codebase (no sandboxing primitive, no built-in tools, only the `createToolFromAgent`/`createToolFromWorkflow` adapters in `packages/core/src/tools/`).

Related: [`future-extensions.md`](./future-extensions.md) (approval dispatcher sketch, pulled forward here), [`near-term-roadmap.md`](./near-term-roadmap.md) §2/§3 (tool package + AI-SDK-tool audit), AGENTS.md ("No Docker, no external services required" — a real constraint on the design below).

---

## Package shape

New workspace package **`packages/tools`** → `@agent-dev-lab/tools`, alongside `packages/core`. Depends on `@agent-dev-lab/core` (for `Tool`, `WorkflowContext`, `AdlError`); core does not depend on it. `packages/core/src/tools/` keeps the two adapters (`createToolFromAgent`/`createToolFromWorkflow`) plus the `ToolProvider`/`createToolProvider`/`resolveToolSource` primitives from §1 of `near-term-roadmap.md` — those live in core (not the new package) since `AgentImpl` itself resolves them on every call.

Rationale for a separate package rather than `core/src/tools/builtin/`: these tools carry a materially different trust boundary than the rest of the runtime (they execute model-directed actions against the host filesystem/process/network), and a project should be able to audit or omit that dependency entirely without touching `@agent-dev-lab/core`.

```
@agent-dev-lab/tools
├── file/          read, write, edit — jailed to a project root
├── bash/          sandboxed shell execution
├── web-search/    thin wrapper choosing provider-native search when available
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

Today, `AgentDefinition.tools` is fixed at agent-definition time and merged with `AdlRuntimeConfig.tools` — there is **no per-call override**. Contrast with `AgentRunInput`, which already lets `endWhen`, `maxTurns`, and `outputSchema` vary per call (`packages/core/src/agent/types.ts:115-132`). `tools` is conspicuously missing from that list, and this package makes the gap concrete: a bash tool's sandbox (which root directory, which executor tier) is exactly the kind of thing that legitimately varies per run, not just per agent definition.

**What the AI SDK already gives us** (checked directly against the `ai@5.0.188` type defs, since this determines what's a wrapper vs. what ADL has to build itself):

- `tools` is already a plain parameter to `streamText` / `generateText` — nothing in the SDK forces tools to be fixed at some earlier "definition time." The constraint is entirely in ADL's own `AgentDefinition`/`AgentRunInput` types, not an AI SDK limitation.
- `prepareStep` (`ai`'s `PrepareStepFunction`) runs before each step of a multi-step tool loop and can return `{ model, toolChoice, activeTools, system, messages }` for that step — **this is a native, per-step mechanism for both model swapping and tool-subset narrowing**, directly relevant to both this doc and [`near-term-roadmap.md`](./near-term-roadmap.md) §1's model-switching item. `activeTools` narrows to a subset of `keyof TOOLS` from the top-level `tools` object — it cannot introduce tools that weren't already registered in that call's `tools`.

**What the AI SDK does _not_ give us**: a way to compute an entirely new tool set from arbitrary run-time context (which sandbox is configured, which dataset/experiment this run belongs to, per-tenant tool availability, etc.) before the call starts. `activeTools`/`prepareStep` only _select among_ a statically-assembled `tools` object — assembling that object from context is squarely ADL's job.

**Proposed design:**

1. Add `tools?: ToolSet` to `AgentRunInput`, resolved the same way `outputSchema`/`endWhen` already are (per-call value wins over the agent definition's). Cheap, mechanical, closes the parity gap.
2. Introduce a `ToolProvider` concept for the "arbitrary inputs → tools" case:

   ```ts
   // sketch — not implemented
   type ToolProviderContext<Context = unknown> = {
     agentId: string;
     memoryScope: string;
     context?: Context;
     workflow?: AgentWorkflowScope;
   };
   type ToolProvider<Context = unknown> = (
     ctx: ToolProviderContext<Context>,
   ) => ToolSet | Promise<ToolSet>;
   ```

   `AgentDefinition.tools` and `AgentRunInput.tools` both accept `ToolSet | ToolProvider`; the runtime resolves it once per call, before constructing `streamText`'s `tools`. This is genuinely new — no equivalent construct in the AI SDK — but it's a small, general primitive (a resolver function), not a new framework.

3. **Tie dangerous tools to a sandbox structurally, not by convention.** This package's own `createBashTool` / `createFileTools` should have **no zero-config unsafe default** — the sandbox/executor is a required constructor argument, not an optional one with a silent bare-subprocess fallback:

   ```ts
   // sketch — not implemented
   createBashTool({ executor: localBashExecutor({ root }) }); // required
   createBashTool(); // should not typecheck / should throw, not silently run unsandboxed
   ```

   This makes "I forgot to configure a sandbox" a build-time or immediate-runtime error instead of a silent security gap discovered later. Combined with (2), a project can swap which sandbox a `ToolProvider` constructs per call (e.g. a stricter root for an untrusted dataset run vs. a looser one for interactive dev) without touching the agent definition.

This section changes the shape of the `@agent-dev-lab/tools` API surface described below: every factory takes its safety-relevant config as a required argument, and the package's tools compose naturally with a `ToolProvider` for context-dependent construction, rather than assuming one static `tools` object per agent for the lifetime of the process.

---

## File-editing tools

- `readFile(path)`, `writeFile(path, content)`, `editFile(path, { find, replace })` (or a small diff-based edit primitive — leaning toward diff-based over whole-file overwrite so large files don't get fully re-sent through the model context on every edit, mirroring why this harness's own edit tool works that way).
- **Jail:** every path resolves against a configured root (`project.tools.fileRoot` or similar) via `path.resolve` + `fs.realpath`, and the result must stay under the resolved root — reject (don't silently clamp) any path that escapes via `..` or a symlink pointing outside. Symlink resolution has to happen _after_ resolving the full path, not just check the string, or a symlink planted mid-tree defeats the check.
- **Non-goals:** no execute bit changes, no arbitrary metadata (chmod/chown) tools. Read/write byte or size caps (e.g. refuse a write over some configurable limit) to avoid a runaway generation filling disk.
- Lower risk than the bash tool below — reasonable to ship first.

---

## Bash tool — the hard part

There is currently **no isolation primitive anywhere in this codebase** to build on. Three real tiers, and the right answer is almost certainly "support all three, pluggable" — this mirrors how [Mastra structures its `Sandbox` abstraction](https://mastra.ai/docs/sandbox/overview#localsandbox), which is worth taking as prior art directly since it's solving the same problem for a similar (agent tool-calling) audience:

### Tier 1 — bare subprocess (fallback, zero-dependency)

`Bun.spawn` / `child_process` with: `cwd` pinned to the configured root, a minimal `env` (allowlist, not the full parent `process.env` — this alone prevents a huge class of accidental secret leakage since ADL already loads `.env` files with API keys into `process.env`), a wall-clock timeout that kills the process group, and output size caps (truncate stdout/stderr past some limit so a runaway command can't exhaust memory piping output back to the model).

**What this does not do:** stop the command from reading/writing anywhere the invoking OS user can reach, opening network connections, or spawning further processes. It is a guardrail against _accidental_ damage and against trivially reading the parent's full environment — not a security boundary against a determined adversary. Mastra's own docs say almost exactly this about `LocalSandbox`'s default mode: _"runs commands on the application host by default and isn't isolated or secure."_ This has to be documented up front, not discovered later. Use this tier only when tier 2 isn't available (e.g. an unsupported OS).

### Tier 2 — native OS sandbox (recommended default)

This is the piece worth adopting directly from Mastra's `LocalSandbox`, and it changes the shape of this section from the original two-option framing: **native, dependency-free OS sandboxing primitives**, not a binary "subprocess vs. Docker" choice.

- **Linux:** [Bubblewrap](https://github.com/containers/bubblewrap) (`bwrap`) — the same unprivileged user-namespace sandboxing Flatpak uses. Wraps the command with a restricted mount namespace (bind-mount only the configured root read/write, everything else read-only or hidden) and can drop network access entirely.
- **macOS:** Seatbelt (`sandbox-exec`) — the same mechanism macOS itself uses to confine App Store apps. Takes a profile restricting filesystem paths and network.

Both are **already present on the OS** (no daemon, no image pulls, no extra install) — which is exactly what keeps this compatible with `AGENTS.md`'s "no Docker, no external services required" posture while still providing a real kernel-enforced boundary instead of tier 1's honor system. This should be the **default** on Linux/macOS when the relevant binary is detected on `PATH`, falling back to tier 1 with a loud warning when it isn't (Windows, or a minimal container image without `bwrap`).

### Tier 3 — container/VM boundary (opt-in)

Docker, gVisor, Firecracker, E2B, or similar remote/container backends (Mastra also offers Daytona/E2B/Vercel/Railway-backed sandboxes) for projects that want an even stronger boundary than tier 2 — full filesystem/network isolation, independent of the host's kernel, or scaling execution off the application server entirely. **This should not be the default** — it would contradict the zero-external-dependency principle that's been true of ADL since 0.1.0, and it adds a real operational dependency (image builds/pulls, daemon or remote-account availability) that most research/dev usage doesn't need. Reserve it for projects that explicitly opt in.

### Design: pluggable executor, not a hardcoded implementation

```ts
// sketch — not implemented
interface BashExecutor {
  run(
    command: string,
    opts: { cwd: string; timeoutMs: number; signal?: AbortSignal },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    truncated: boolean;
  }>;
}
```

Ship a default `localBashExecutor` in `@agent-dev-lab/tools` that auto-selects tier 2 when `bwrap`/`sandbox-exec` is available and falls back to tier 1 otherwise (mirroring Mastra's `nativeSandbox` option, but on by default rather than opt-in, since it costs nothing extra to use when present). A project can supply its own `BashExecutor` (Docker-backed, E2B-backed, whatever) through the same config surface the tool factory takes for tier 3. This is the same shape as the `ApprovalDispatcher` pattern below — the package provides a safe, dependency-free default and an escape hatch for projects that need more.

**Also worth borrowing from Mastra's tool API shape** (not just the executor): rather than one synchronous run-to-completion tool, Mastra exposes `execute_command` / `get_process_output` (with `tail` and `wait: true`) / `kill_process` as separate tools, so a model can start a long-running command, poll or tail its output, and kill it — useful for dev servers or long builds. Worth doing eventually, but it's materially more complex (needs a process registry keyed by call/session) than the synchronous version above — treat it as a fast-follow once the synchronous tool ships, not part of this first increment.

---

## Web search tool

Before building anything custom here, finish the audit called for in `near-term-roadmap.md` §3: several providers already expose hosted web search as an AI SDK provider tool (e.g. OpenAI's `web_search`), and those run server-side on the provider's infrastructure — no sandboxing concern on ADL's side at all, since ADL never executes the fetch itself. **Prefer provider-native search whenever the configured model supports it**, and only fall back to a custom implementation (project-supplied fetch + an allow/deny domain list + response size caps) for providers/models without one. The custom fallback's "sandboxing" is really just: no arbitrary redirects to internal/private IP ranges (SSRF guard), and treating fetched content as untrusted text, never executed.

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
