---
"@agent-dev-lab/tools": patch
---

Add `fetchUrl` (`createFetchUrlTool` / `createWebToolProvider`) to retrieve one http(s) URL as text or markdown. Private, loopback, and link-local addresses are refused unless a concrete-host `allowedUrls` entry or `allowPrivateNetwork` is set. Host-wildcard patterns (`**`, `http://*/**`, …) alone do not bypass the address check.
