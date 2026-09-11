---
"@agent-dev-lab/core": patch
---

Every `workflow.run()` now records which project code produced it, as a tag, unless the caller already supplied one with the same prefix. Precedence: `AdlRuntimeConfig.version` → `version:<value>`; otherwise jj `@` (`--ignore-working-copy`, so provenance never writes a jj operation) then git HEAD → `commit:<id>`, with `+dirty` when the tree carries work beyond its parent (or when cleanliness is unknown — that is the reading that does not over-claim). No VCS and no configured version means no tag. A call-site `tags` entry whose prefix matches (`version:` or `commit:`) wins over the automatic one. `version: false` skips tagging entirely, including the VCS lookup; `createTestRuntime` defaults to that so tests do not depend on ambient repository state.
