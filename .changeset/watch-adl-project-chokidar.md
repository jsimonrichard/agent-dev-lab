---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
---

`watchAdlProject` now watches through chokidar (ignored trees pruned during the scan, symlinks not followed) instead of a hand-rolled recursive `fs.watch`. **Breaking:** it returns `{ ready, close }` rather than a dispose function. `ready` resolves once the initial scan has subscribed every directory — await it before relying on an edit being noticed — and rejects if the watcher could not arm at all, so a dead watch is not indistinguishable from "nobody edited."

The inspection UI no longer has a Vite reload plugin or `/api/project/reload`. File watch runs in the same process-host isolate that serves `/api` (`ensureAdlProjectFileWatch`), so a reload updates the registry that actually executes runs.
