---
"@agent-dev-lab/tools": patch
---

Never remove a caller-supplied ASRT `tmpDir` on executor dispose (only auto-`mkdtemp` dirs are cleaned up), so shared explicit paths across pool keys stay intact.
