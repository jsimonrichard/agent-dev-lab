# `@agent-dev-lab/tools`: threat model and open decisions

**Status:** Ship surface lives in [`packages/tools/README.md`](../packages/tools/README.md). This note keeps the **threat model** and **open decisions** only — not the implementation diary. Last reconciled: **2026-10-05**.

Related: [`execution-control-plan.md`](./execution-control-plan.md) (EffectGate / suspend), [`near-term-roadmap.md`](./near-term-roadmap.md) §2, AGENTS.md (no Docker required for **core**; tools may need host OS packages).

---

## Threat model

**In scope:** the model is the untrusted party. Tool-call arguments are adversarial input (prompt injection from tool results, mistaken or jailbroken models). Sandboxing must make misuse hard to reach accidentally and clearly logged/gated.

**Out of scope (v1):** compromised host dependencies, a malicious project author, or supply-chain attacks on `@agent-dev-lab/tools`. This package raises the bar against a misbehaving **model**; it is not a multi-tenant security boundary.

**Package boundary:** `@agent-dev-lab/tools` is optional. Core does not depend on it. Dangerous factories take safety-relevant config as **required** arguments (no omit→unsandboxed default). Missing sandbox prerequisites **fail closed** with a clear error — never silently run weaker.

---

## What shipped (pointer only)

See the package README for current API. In short:

| Area          | Landed                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| File / search | `createFileTools` / `createSearchTools` jailed to a root; byte caps                                                                         |
| Bash          | `BashExecutor` + ASRT (`createAsrtBashExecutor`) and Linux native `bwrap` (`createNativeBashExecutor`); no automatic fallback between tiers |
| Network       | `fetchUrl` with SSRF guard; no custom web-search tool — prefer provider-native search                                                       |
| MCP           | `createMcpToolProvider` — trusts the server; every call goes through required `EffectGate`                                                  |
| Approval      | Required `effectGate` + `effectScope` on factories; `ApprovalDispatcher` adapter over `EffectGate`                                          |

`packages/core/src/tools/` stays adapters + `ToolProvider` only.

---

## Open decisions / gaps

These are also rows in [`near-term-roadmap.md`](./near-term-roadmap.md) §2.

1. **Inspection UI Allow/Deny** — host awaits a human inside `ApprovalDispatcher.request` (or suspend + `WorkflowStore.resolveSuspend`). Substrate is per-call; remembering an allow is dispatcher policy (`ApprovalDecision.remember: "agentCall"`, keyed by agent call + `source` + tool name — `createStickyToolAllowHandler` was removed 2026-10-12 because it remembered every allow by tool name alone), not a core decision variant. **Default without a gate: fail-closed** — pass `allowAllGate` explicitly for tests/CI.
2. **`createNativeBashExecutor` macOS backend** — Seatbelt (`sandbox-exec`) not implemented; throws on `darwin`. Use ASRT on Mac until a verified SBPL profile exists.
3. **`writeFile` / `editFile` parent-directory creation** — parent must already exist. Safe `mkdir -p` needs level-by-level jail checks (symlink defeat mid-path).
4. **Resource limits beyond wall-clock timeout** (`ulimit` / cgroups) — undecided.
5. **Env CoW / snapshot-restore for discard** — execution-control §4; not started.

---

## Non-goals

- Plugin/extension marketplace
- Multi-tenant / untrusted-user isolation
- A second web-search implementation alongside provider-native search
- Silent downgrade when sandbox prerequisites are missing
