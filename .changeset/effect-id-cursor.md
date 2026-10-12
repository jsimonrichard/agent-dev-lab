---
"@agent-dev-lab/core": patch
---

`seedRetryFromCursor` now resolves `cursor.effectId` via persisted `effect_intent` events to the enclosing step (step-atomic replay). Unknown, conflicting, and root-level effect ids fail closed; `runSeq` remains unimplemented.
