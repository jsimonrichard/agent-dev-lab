---
"@agent-dev-lab/core": patch
---

Add optional `ToolProvider.dispose?()` (project reload/unload) and `onRunEnd?()` (per agent episode), plus `agentCallId` and `projectRoot` on the tool-provider envelope. `LoadedAdlProject` attaches `project.root` and disposes outgoing registry providers after a successful reload.
