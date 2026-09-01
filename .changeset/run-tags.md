---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Add run tagging: `workflow.run(input, { tags })` records labels on the run, `WorkflowStore.listRuns({ tags })` filters by them (any-of match), and `WorkflowStore.setRunTags` replaces a run's tags after the fact. The inspection UI sidebar shows tag badges and a tag filter box once a workflow has any tagged runs. First step toward organizing the flat run list (see `notes/near-term-roadmap.md` §5) — git-hash tagging and input datasets are follow-ups that build on this.
