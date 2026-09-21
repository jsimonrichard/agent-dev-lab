---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Stop re-scanning the workflow store into the in-memory event log on every dashboard request after the first hydrate. `acquireAdlProject` exposes `getAdlProjectLoadCount()` so sequential acquires can assert a single `loadAdlProject`.
