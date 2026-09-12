---
"@agent-dev-lab/tools": patch
---

`describe*Env` reports resolved sandbox defaults (`allowRead` is `[root]`/`[cwd]` when omitted, or `"unbounded"` only when the host passed `UNBOUNDED_ALLOW_READ`; empty deny/domain lists) so the model does not have to apply this package's `null`/`[]` rules.
