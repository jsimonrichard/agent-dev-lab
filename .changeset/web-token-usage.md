---
"@agent-dev-lab/web": patch
---

Show provider-reported token usage (separate input / output) in conversation and workflow-run sidebars and inspect panels. Conversation loaders return per-episode usage with the transcript so "This call" does not wait on a second fetch; that column appears only when an episode is highlighted via `?call=`. Agent messages get a three-dots **Inspect** action that links to the episode-specific view.
