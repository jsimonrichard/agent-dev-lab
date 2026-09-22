---
"@agent-dev-lab/core": minor
---

Attempt-lineage resumability: `WorkflowStore.seedRetryAttempt` seeds a new attempt forest (replayed copies of still-valid work, plus re-exec) and does not mutate the prior run. Path-stable step slots replace UUID-parent cache keys. `StepOptions.pure` defaults to true; `pure: false` always re-executes when a new attempt reaches that path.

Custom `WorkflowStore` implementors must add `seedRetryAttempt`, `materializeAttemptRun`, `materializeAttemptStep`, and `listStepRecords`. In-memory and SQLite stores ship them.

Successful nested runs with nothing left to re-exec short-circuit as replay copies. Failed or cancelled nested runs do not. When the spawning step re-executes, `parentStepId` on a short-circuited child is patched to the new step id.

Opening an existing SQLite database runs keyed migration `2026-09-path-stable-step-slots`, which deletes every row in `adl_step_outputs`. Events stay. The step skip cache is empty until later runs write outputs.
