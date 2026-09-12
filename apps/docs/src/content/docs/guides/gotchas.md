---
title: Gotchas
description: Sharp edges worth knowing about before they surprise you.
---

- **`.env*` edits need a restart.** Env is loaded once at process start — `adl dashboard` otherwise hot-reloads registry (agent/workflow/template) edits as soon as the process starts (no browser required). `--serve` turns that off.
- **Workflow Zod fields are `inputSchema` / `outputSchema`**, not `input` / `output` (those names broke on Zod 4). `adl init` scaffold already uses the new names.
- **Omitted `memoryScope`** allocates a random id; the next `agent.run` will not see that transcript unless you pass it back.
- **System prompt pin:** the first episode wins; a different agent on the same scope warns and keeps the pin unless `systemPromptConflict: "use-current"`.
- Only ids listed in `adl.config` `agents` / `workflows` appear in the CLI/UI; `titleWorkflow` helpers are typically left out of those arrays.
- The `adl` binary is provided by `@agent-dev-lab/cli`, not a package named `adl`.
- **`adl init` does not create a Git repo.** Pass `--git` / `-g` if you want `git init`. It still writes `.gitignore`.
- **`@agent-dev-lab/tools` has no unsandboxed default.** Providers need `allowWrite` (or an escape-hatch `executor`); file tools need a jail root. Missing `bwrap` / `socat` / `ripgrep` fails closed.
- **`writeFile` does not create parent directories.** The parent must already exist.
- **File/bash tools are unsupported on Windows.** `fetchUrl` is untested there.
