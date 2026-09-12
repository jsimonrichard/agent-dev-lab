---
"@agent-dev-lab/tools": patch
---

Run each `createAsrtBashExecutor` against its own supervisor process so two executors can have different ASRT policies in one host. `dispose()` ends the supervisor; it also exits if the host process dies.
