---
"@agent-dev-lab/tools": patch
---

Add `fetchUrl` (`createFetchUrlTool` / `createWebToolProvider`) to retrieve one http(s) URL as text or markdown. Private, loopback, and link-local addresses are refused unless `allowedUrls` or `allowPrivateNetwork` is set.
