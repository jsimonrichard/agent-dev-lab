---
"@agent-dev-lab/core": patch
---

Structured output uses the final step's complete JSON parse. A prose final answer fails the episode with `NoObjectGeneratedError` (model text on the error and `agent_failed`).
