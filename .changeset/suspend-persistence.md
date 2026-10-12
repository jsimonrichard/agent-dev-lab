---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Persist EffectGate suspends on the WorkflowStore. A gate that returns `suspend` parks the run (`workflow_suspended`, run status `"suspended"`) until `resolveSuspend` records a decision, then the run continues from the parked cursor (`workflow_resumed`). Approvals and debugger pauses share the same suspend record. The inspection UI shows pending approvals with Allow / Deny.

**Breaking for custom stores:** `WorkflowStore` gains suspend methods (`createSuspend`, `resolveSuspend`, `getSuspend`, `listPendingSuspends`, `waitForSuspendResolution`, `seedRetryFromCursor`), and `WorkflowRunSummary.status` can be `"suspended"`. The bundled in-memory and SQLite stores implement them; existing SQLite databases upgrade in place.
