---
"@agent-dev-lab/tools": patch
---

`describe*Env` reports resolved defaults: omitted `allowRead` is `[cwd]`, `"**"` (`UNBOUNDED_ALLOW_READ`) only when the host opted into host-wide reads, and `null`/`[]` mean nothing readable.
