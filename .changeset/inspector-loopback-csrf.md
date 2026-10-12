---
"@agent-dev-lab/web": patch
"@agent-dev-lab/cli": patch
---

Fix the inspection UI accepting requests from other machines and sites. `adl dashboard --serve` / `--prebuilt` now listen on `127.0.0.1` instead of every interface. The inspector answers only when the `Host` header is a loopback name (blocking DNS rebinding) and rejects POSTs whose Origin or `Sec-Fetch-Site` is another site, so a web page can no longer start, cancel, approve, or retry runs. Clients that send no Origin (curl, scripts) still work.
