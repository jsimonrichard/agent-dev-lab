---
"@agent-dev-lab/cli": patch
---

Stop `adl dashboard --serve` from hanging when the CLI is signaled without a TTY (tests and `kill <pid>`).
