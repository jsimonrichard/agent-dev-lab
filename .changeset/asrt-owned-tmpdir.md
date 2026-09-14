---
"@agent-dev-lab/tools": patch
---

Create an owned ASRT `TMPDIR` (or accept `tmpDir` with an ownership guard) so `mktemp` and other temp-file writers work without the embedder setting `CLAUDE_CODE_TMPDIR`.
