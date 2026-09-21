---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Fix the workflow run waterfall so nested (sub-workflow) runs show up in the chart under the calling step or the workflow root — the intended behavior once nested runs had their own ids. Nested `workflow.run()` records `parentStepId` when invoked inside an active `ctx.step`; the inspection UI renders those children in the tree/waterfall (expand to load child events), with a link through to the child's run page.
