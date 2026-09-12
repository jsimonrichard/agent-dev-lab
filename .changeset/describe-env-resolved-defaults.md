---
"@agent-dev-lab/tools": patch
---

`describe*Env` reports resolved sandbox defaults (`allowRead: "unbounded"` when reads are not confined; empty deny/domain lists) so the model does not have to apply this package's `null`/`[]` rules.
