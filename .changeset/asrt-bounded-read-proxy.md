---
"@agent-dev-lab/tools": patch
---

Keep ASRT's Linux HTTP proxy reachable when `allowRead` is bounded. The host-wide deny that encodes a bound read list was tmpfs'ing `/tmp` over the bridge sockets, so allowed and denied domains both failed with `Proxy CONNECT aborted`.
