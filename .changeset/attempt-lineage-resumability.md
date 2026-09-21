---
"@agent-dev-lab/core": minor
---

Attempt-lineage resumability: path-stable step slots, `parentStepId` on nested runs, `StepOptions.pure`, and `WorkflowStore.seedRetryAttempt` so retries seed a new attempt forest (replayed copies + re-exec) instead of mutating the prior run in place.
