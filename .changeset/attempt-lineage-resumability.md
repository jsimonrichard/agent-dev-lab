---
"@agent-dev-lab/core": patch
---

`seedRetryAttempt` starts a new attempt (replay still-valid steps, re-exec the rest) without mutating the prior run. `StepOptions.pure` defaults to true. Custom `WorkflowStore`s must add `seedRetryAttempt`, `materializeAttemptRun`, `materializeAttemptStep`, and `listStepRecords`. Opening an existing database deletes `adl_step_outputs`; events stay.
