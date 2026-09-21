---
"@agent-dev-lab/web": patch
---

Do not cancel in-flight nested run fetches when another nest is expanded or selected. Effect cleanup was discarding successful loads and leaving the expand spinner stuck until a later interaction retried.
