---
"@agent-dev-lab/tools": patch
---

Add `createFetchUrlTool` and `createWebToolProvider`: a `fetchUrl` tool that retrieves one http(s) URL and returns its body as readable text or markdown. Distinct from web search (which finds pages; this reads one). Private, loopback, and link-local addresses are refused — including after a redirect — via an allowlist against `ipaddr.js` `range()` classification. `http:` connections pin the address the guard just validated so a 0-TTL DNS rebind cannot flip the destination between check and connect; `https:` relies on TLS hostname verification instead. Fetched content is untrusted text (HTML via `turndown`; `javascript:`/`data:` links flattened to visible text). Hosts can exempt specific URL patterns with `allowedUrls` or disable the address check with `allowPrivateNetwork`. Response size and wall-clock timeout default to the same 1 MB / 30s knobs as the file and bash tools. See `packages/tools/src/web/README.md`.
