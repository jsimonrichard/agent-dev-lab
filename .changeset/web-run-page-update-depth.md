---
"@agent-dev-lab/web": patch
---

Stop residual max-update-depth loops on the workflow run page: URL→selection sync no longer depends on live `view.steps` identity (SSE rebuilt that array every event); nested message prefetch no longer lists its Map in effect deps; drop the waterfall `clientWidth`→pixel-width ResizeObserver feedback loop; stabilize JSON validity reporters; hydrate live duration labels with a stable clock (`0` until mount) so SSR matches the client. Adds a `tick-burst` Playwright regression.
