---
"@agent-dev-lab/tools": patch
---

Require `EffectGate` (+ `effectScope` on factories) before tool materialize; ship `ApprovalDispatcher` adapter, sticky-allow handler policy, and explicit `allowAllGate` at tests/playground. Breaking: constructors no longer omit a gate.
