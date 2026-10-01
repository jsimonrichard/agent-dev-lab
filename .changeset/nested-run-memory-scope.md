---
"@agent-dev-lab/core": minor
---

Expose `rootWorkflowRunId` on `WorkflowContext` (with existing `parentWorkflowRunId`). `memoryScopeWithSuffix` now keys the nest-tree root; add `runLocalScope` for the immediate run. Isolated runs stay their own root.
