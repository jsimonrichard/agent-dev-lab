---
"@agent-dev-lab/tools": patch
---

On usr-merged hosts, expand ASRT's host-wide read deny into real root directories instead of `"/"` so bwrap does not try to tmpfs symlink mounts like `/bin`.
