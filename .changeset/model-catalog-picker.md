---
"@agent-dev-lab/core": patch
"@agent-dev-lab/web": patch
"@agent-dev-lab/cli": patch
---

Add a host-only `adl.config` model catalog (`models[]` with factory), inspector next-turn picker, CLI `--model`, and optional `apiKeyEnv` preflight — core still only receives live `LanguageModel` via `AgentRunInput.model`.
