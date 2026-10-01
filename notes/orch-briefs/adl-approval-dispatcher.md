## Goal

Ship a tool-call approval gate for `@agent-dev-lab/tools` (file/bash/etc.) whose public interface is an adapter over the shared effect-gate / suspend shape from the execution-control plan — so the step debugger and `ctx.requestApproval` can reuse the same pause substrate later instead of growing a second resume protocol.

## Principles

- Fail closed — no silent fallbacks
- Upstream before workaround
- Generalize; don't special-case
- One concern per change
- Plan first
- State what is not done

## Scope

1. Read [`notes/execution-control-plan.md`](../execution-control-plan.md) §1 / §5 and import `EffectGate` / `composeEffectHandlers` / `allowAllGate` from `@agent-dev-lab/core`. Adapter only — do not ship a dead-end `ApprovalDispatcher`-only resume protocol.
2. Wrap tool `execute()` with pre-materialize approval; require an `EffectGate` on tool constructors (pass `allowAllGate` in tests/playground).
3. Resolve remaining open question in [`tool-sandboxing.md`](../tool-sandboxing.md): per-call vs per-tool-type. **Fail-closed is decided** — no warn-and-allow silent permit.
4. Headless test dispatcher; document UI dispatcher as follow-up (inspection Allow/Deny).
5. Changesets as needed for `tools` (and core only if the adapter needs a follow-up export).

## Out of scope

- Full Shepherd trace / debugger implementation (Lane A).
- `ctx.requestApproval` workflow pauses (needs suspend persistence — same substrate, later PR).
- MCP provider (Lane D) beyond calling the same gate once it exists.
- Env CoW / sandbox snapshots.

## Success criteria

1. File/bash tool calls can be denied by a dispatcher before side effects; covered by tests.
2. Public types are expressible as "tool intent → decision" compatible with the execution-control sketch (documented mapping).
3. CI/dev can run with an explicit auto-approve test dispatcher — not an implicit ambient allow.
4. `.claude/gate.sh full` green.

## Constraints

- **Fail-closed decided (2026-10-01).** Playground/CI must pass `allowAllGate` (or an accept-all handler) explicitly.
- Do not invent resume-by-workflowRunId-only state machines that ignore suspend handles.
- Dangerous tools keep required executor/sandbox constructor args.

## Handoff notes

Parent plan lane map E. Core exports `EffectGate`, `composeEffectHandlers`, `allowAllGate`, `SuspendHandle`, `TraceCursor`. Sketches: `notes/future-extensions.md`, `notes/tool-sandboxing.md`.
