---
"@agent-dev-lab/core": patch
---

`MessageStore.copy` copies a transcript onto an empty scope. A workflow step records each scope the runtime message store loads, saves, copies, or deletes. On retry, a skipped step's `${workflowRunId}:…` transcript is copied onto the new attempt's scope. Custom message stores must add `copy`.
