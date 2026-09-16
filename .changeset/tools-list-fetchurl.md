---
"@agent-dev-lab/tools": patch
---

Workspace `listTools` still advertises `fetchUrl` when network is off, noting it is only added to a run when `allowNetwork` is true. `getTools` still omits the tool until then.
