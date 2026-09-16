---
"@agent-dev-lab/tools": patch
---

File, bash, web, and workspace `contextSchema`s declare the same hardcoded runtime defaults the providers already apply (`allowNetwork: false`, `allowEnv: []`, byte caps, timeouts), so hosts that sample `{}` can show those values instead of omitted keys.
