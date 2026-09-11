---
"@agent-dev-lab/core": patch
---

`workflow.run()` and `agent.run()` now tag provenance as `version:<value>` from `AdlRuntimeConfig.version`, or `commit:<id>` from jj/git (`+dirty` when the tree is dirty). A matching call-site tag wins; `version: false` skips tagging (`createTestRuntime` defaults to that).
