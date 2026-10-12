---
"@agent-dev-lab/core": patch
---

Forward `maxRetries` and `streamRetries` from the agent definition and from `agent.run` / `agent.stream` into `streamText`. A positive `streamRetries` also covers a dropped provider stream (retryable HTTP 200): ADL turns that rejection into an error chunk so the SDK's own retry reruns the step, on the same budget. Text still streams incrementally, so a dropped attempt's partial text can appear on live streams; the result, structured output, and stored transcript exclude it. `streamRetries` with a string model id fails with `INVALID_INPUT`. Omit both to keep the SDK defaults.

An error chunk the SDK does not retry now fails the episode, even after partial text; previously the step finished with that partial text as the answer.
