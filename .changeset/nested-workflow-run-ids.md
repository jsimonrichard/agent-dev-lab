---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Nested `workflow.run()` allocates its own `workflowRunId` and records `parentWorkflowRunId` instead of sharing the parent's id (which corrupted the run row). `listRuns` gains `rootsOnly` / `parentWorkflowRunId` filters and `listDescendantRuns`. The inspection UI defaults to roots-only with a Non-Root toggle, parent back-link, and child run links.
