---
"@agent-dev-lab/cli": patch
---

Pick the next free port when `adl dashboard --port` is already bound, instead of letting Vite hop on its own or Nitro swallow `EADDRINUSE` with no listen banner. `--strictPort` fails instead of hopping.
