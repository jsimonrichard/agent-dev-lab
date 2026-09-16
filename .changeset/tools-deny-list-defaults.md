---
"@agent-dev-lab/tools": patch
---

File, bash, and workspace `contextSchema`s default `denyRead` / `denyWrite` to `[]`, matching `resolveDenyList` (omit and `null` already mean deny nothing).
