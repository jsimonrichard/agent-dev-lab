---
"@agent-dev-lab/tools": patch
---

Workspace `fetchUrl` is omitted when `allowNetwork` is false (the default), matching the bash sandbox. Set `allowNetwork: true` (constructor or per-call context) to include it; `fetchUrl: false` still forces it off.
