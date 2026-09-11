---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

`watchAdlProject` now uses chokidar and returns `{ ready, close }` instead of a dispose function (**breaking**). The inspection UI watches in the same process as `/api`; the Vite reload plugin and `/api/project/reload` are gone.
