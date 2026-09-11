---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add run tags: `workflow.run(input, { tags })` and `agent.run({ tags })` record them, `WorkflowStore.listRuns({ tags })` filters by any-of match, and `setRunTags` replaces a workflow run's tags. The inspection UI shows them in inspector footers.
