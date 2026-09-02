---
"@agent-dev-lab/core": patch
---

`LoadedAdlProject.getAgent()` and its internal agent registry now type against `AnyAgent` instead of `Agent<unknown, ToolSet, unknown>`, matching `AdlProjectConfig.agents`. Removes an internal cast that was no longer doing anything (verified: `Agent<Concrete, ...>` already widens into `AnyAgent` with no cast needed, since `any` in every slot sidesteps the variance issues that motivated the old `Agent<unknown, ToolSet, unknown>` registry shape) and corrects several doc comments that still described that shape.
