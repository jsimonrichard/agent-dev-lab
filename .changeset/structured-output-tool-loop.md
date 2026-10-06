---
"@agent-dev-lab/core": patch
---

Structured output with tools no longer sends a JSON response format on the tool loop. Models that receive both skip the tools and return a minimal schema object. A tool-free follow-up call formats the answer when the loop stops with non-JSON text.
