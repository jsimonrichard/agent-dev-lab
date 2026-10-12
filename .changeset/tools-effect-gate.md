---
"@agent-dev-lab/tools": patch
---

**Breaking:** every tool factory and provider now requires an `EffectGate` (and an `effectScope` on factories). `createWebToolProvider` and `createFetchUrlTool` can no longer be called without options, and `getTools` throws unless the context supplies `recordEffect`, which the ADL runtime always does. Each tool call records an `effect_intent`, asks the gate, and records `effect_settled`; a `suspend` decision parks the run on the runtime's persisted suspend. Also ships an `ApprovalDispatcher` adapter and a sticky-allow handler policy; pass `allowAllGate` explicitly in tests.
