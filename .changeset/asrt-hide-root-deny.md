---
"@agent-dev-lab/tools": patch
---

ASRT `describe()` reports the caller's `denyRead` only. The host-wide `/` deny used to encode a bound `allowRead` stays inside the wrapper.
