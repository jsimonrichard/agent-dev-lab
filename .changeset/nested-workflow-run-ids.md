---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Nested `workflow.run()` allocates its own `workflowRunId` and records `parentWorkflowRunId` instead of sharing the parent's id (which corrupted the run row). `listRuns` gains `rootsOnly` / `parentWorkflowRunId` filters. Custom `WorkflowStore` implementors must add `listDescendantRuns` (BFS over `parentWorkflowRunId`; in-memory and SQLite stores ship it). The inspection UI defaults to roots-only with a Non-Root toggle, parent back-link, and child run links. Cancel on a nested run id walks to the active root handle (nested abort is linked to the parent).
