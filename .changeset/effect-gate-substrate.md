---
"@agent-dev-lab/core": patch
---

Add the EffectGate substrate: `EffectIntent` / `EffectDecision` types, `composeEffectHandlers` (denies when no handler decides), an explicit `allowAllGate` for hosts and tests, and `gateWithIntent`, which records an `effect_intent` event before the gate decides and an `effect_settled` event after. Tool approval, `ctx.requestApproval`, and the step debugger all go through this one gate. `createAdlRuntime` uses `allowAllGate` as the host policy when `effectGate` is omitted (the debugger still runs first). `ExtendedToolProviderContext` gains a required `recordEffect`; the agent runner supplies it, so only code that builds that context by hand (usually tests calling `getTools` directly) needs to pass one.
