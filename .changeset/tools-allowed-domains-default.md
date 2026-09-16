---
"@agent-dev-lab/tools": patch
---

`allowedDomains` defaults to `["*"]` and is documented as applying only when `allowNetwork` is true. The pool ignores domain lists while network is off so the default does not open the sandbox.
