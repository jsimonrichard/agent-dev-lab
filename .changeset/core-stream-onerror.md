---
"@agent-dev-lab/core": patch
---

Record the `streamText` `onError` payload on `agent_failed` when the model fails before producing a step, instead of the SDK's `NoOutputGeneratedError` wrapper.
