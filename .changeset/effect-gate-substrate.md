---
"@agent-dev-lab/core": patch
---

Add the EffectGate substrate: `EffectIntent` / `EffectDecision` types, `composeEffectHandlers` (denies when no handler decides), an explicit `allowAllGate` for hosts and tests, and `gateWithIntent`, which records an `effect_intent` event before the gate decides and an `effect_settled` event after. Tool approval, `ctx.requestApproval`, and the step debugger all go through this one gate.
