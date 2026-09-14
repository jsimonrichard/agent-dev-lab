---
"@agent-dev-lab/tools": patch
---

Point the package `types` condition at `dist/*.d.ts` so consumers typecheck the published declarations instead of the package source (which is not a standalone program).
