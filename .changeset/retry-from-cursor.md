---
"@agent-dev-lab/core": minor
---

Add `WorkflowStore.seedRetryFromCursor` (`TraceCursor`; step id is the UI alias). `seedRetryAttempt({ fromStepId })` is the compatibility wrapper. `effectId` / `runSeq` fail closed until effect intents are persisted.
