---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add run tagging: `workflow.run(input, { tags })` records labels on the run, `agent.run({ tags })` records them on `agent_started`, `WorkflowStore.listRuns({ tags })` filters workflow runs by them (any-of match), and `WorkflowStore.setRunTags` replaces a workflow run's tags after the fact. The inspection UI shows tags in the workflow and agent inspector footers. A better list-filter UI is deferred. Automatic `version:` / `commit:` provenance tags are in `run-version-tags.md`; input datasets remain a follow-up.
