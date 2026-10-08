---
"@agent-dev-lab/core": patch
---

Forward `maxRetries` and `streamRetries` from the agent definition and from `agent.run` / `agent.stream` into `streamText`. A positive `streamRetries` also retries a dropped provider stream (retryable HTTP 200) inside that model call, because the SDK option only sees error chunks and this failure rejects the stream. Omit both to keep the SDK defaults.
