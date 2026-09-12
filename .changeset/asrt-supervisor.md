---
"@agent-dev-lab/tools": patch
---

ASRT executors run in a supervisor subprocess. `dispose()` ends it; it also exits if the host process dies.
