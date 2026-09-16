---
"@agent-dev-lab/web": patch
"@agent-dev-lab/tools": patch
---

Tool-provider context schemas no longer wrap defaulted fields in `.partial()`. The inspection UI treats Zod `.default()` as a present value (not optional) and shows it in the schema display.
