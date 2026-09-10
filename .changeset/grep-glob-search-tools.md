---
"@agent-dev-lab/tools": patch
---

Add model-facing `grep` and `glob` tools (`createSearchTools`) that run a fixed `rg` argv through the sandboxed `BashExecutor`. `BashExecutor.run` now takes argv rather than a command string — the bash tool wraps `["/bin/bash", "-c", command]`; search tools never put a model-supplied pattern through a shell. Paths are confined with `createFileJail` before argv construction. The subprocess read boundary is the executor's `allowRead` (when configured), not a kernel guarantee from the search tools themselves.
