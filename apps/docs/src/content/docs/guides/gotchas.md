---
title: Gotchas
description: Sharp edges worth knowing about before they surprise you.
---

- **`.env*` edits need a restart.** Env is loaded once at process start — `adl dashboard` otherwise hot-reloads registry (agent/workflow/template) edits.
- **Omitted `memoryScope`** allocates a random id; the next `agent.run` will not see that transcript unless you pass it back.
- **System prompt pin:** the first episode wins; a different agent on the same scope warns and keeps the pin unless `systemPromptConflict: "use-current"`.
- Only ids listed in `adl.config` `agents` / `workflows` appear in the CLI/UI; `titleWorkflow` helpers are typically left out of those arrays.
- The `adl` binary is provided by `@agent-dev-lab/cli`, not a package named `adl`.
