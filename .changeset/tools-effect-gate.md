---
"@agent-dev-lab/tools": patch
---

**Breaking:** every tool factory and provider now requires an `EffectGate` (and an `effectScope` on factories). `createWebToolProvider` and `createFetchUrlTool` can no longer be called without options, and `getTools` throws unless the context supplies `recordEffect`, which the ADL runtime always does. Each tool call records an `effect_intent`, asks the gate, and records `effect_settled`; a `suspend` decision parks the run on the runtime's persisted suspend. Also ships an `ApprovalDispatcher` adapter: an allow covers one call unless the dispatcher returns `remember: "agentCall"`, which allows the same tool (same `source` and name) for the rest of that agent call. Pass `allowAllGate` explicitly in tests.
