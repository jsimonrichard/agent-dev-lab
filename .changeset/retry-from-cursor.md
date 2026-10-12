---
"@agent-dev-lab/core": patch
---

Add `WorkflowStore.seedRetryFromCursor` (`TraceCursor`). `cursor.effectId` resolves through the persisted `effect_intent` events to the enclosing step (step-atomic replay); `stepId` is the UI alias. Unknown, conflicting, and root-level effect ids are rejected, and `runSeq` cursors are not supported yet. `seedRetryAttempt({ fromStepId })` keeps working as a wrapper.
