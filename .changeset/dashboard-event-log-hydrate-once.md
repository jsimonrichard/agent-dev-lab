---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

Stop re-scanning the workflow store into the in-memory event log on every dashboard request after the first hydrate. Concurrent cold callers share one in-flight fill; a failed fill leaves the gate open for retry. `acquireAdlProject` exposes `getAdlProjectLoadCount()` so sequential acquires can assert a single `loadAdlProject`.
