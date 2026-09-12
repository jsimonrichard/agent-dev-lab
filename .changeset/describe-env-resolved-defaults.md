---
"@agent-dev-lab/tools": patch
---

`describe*Env` reports resolved sandbox defaults (`allowRead` is `[root]`/`[cwd]` when omitted, or `"**"` (`UNBOUNDED_ALLOW_READ`) only when the host opted into host-wide reads; `null`/`[]` mean nothing readable; empty deny/domain lists) so the model does not have to apply this package's rules.
