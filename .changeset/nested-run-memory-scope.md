---
"@agent-dev-lab/core": patch
---

Expose `rootWorkflowRunId` on `WorkflowContext` (with existing `parentWorkflowRunId`). **Breaking:** `memoryScopeWithSuffix` now keys the nest-tree root (`${rootWorkflowRunId}:${suffix}`) instead of the immediate run; add `runLocalScope` for the prior immediate-run formula. Isolated runs stay their own root.
