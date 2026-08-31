---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Hold the inspection UI's loaded project on a process-wide host in `@agent-dev-lab/core/project` so Vite SSR isolates share one registry. File-watch reloads then show up on `GET /api/project` and SSE.
