---
"@agent-dev-lab/web": patch
---

Stop the workflow run page from calling `router.invalidate()` on loader-seeded lifecycle events (that rebuilt `initialEvents`, reset the live event list, and looped until max update depth).
