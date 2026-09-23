---
"@agent-dev-lab/core": patch
---

`MessageStore.copy` copies a transcript onto an empty scope. A workflow step records each scope it touches and the transcript in that scope when the step finishes. On retry, a skipped step's `${workflowRunId}:…` transcript is written onto the new attempt as it was before the retried step. Custom message stores must add `copy`.
