---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Nested `workflow.run()` gets its own `workflowRunId` and `parentWorkflowRunId`. The run list defaults to roots, with a Non-Root toggle. Custom `WorkflowStore`s must add `listDescendantRuns`. Cancel on a nested id aborts the active root.
