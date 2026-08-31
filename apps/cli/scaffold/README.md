# {{DISPLAY_NAME}}

ADL project scaffolded by `adl init`.

## Setup

```bash
bun install
# or: npm install
```

Add provider keys to `.env` at the project root (loaded automatically, like Next.js):

```bash
OPENAI_API_KEY=sk-...
```

Optional: `ADL_MODEL` (default `gpt-4o-mini`), `ADL_SQLITE_PATH` (default `.data/agent-dev-lab.sqlite`).

## Commands

```bash
bun run dev
bun run dashboard
bunx adl workflow list
bunx adl agent list
bunx adl workflow run demo-counter --input '{"steps":3}'
bunx adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
bunx adl agent run assistant --input "What is Agent Dev Lab?"
```

The `dev` / `dashboard` scripts above call `bun --bun adl dashboard`. Without Bun installed, run the CLI directly instead: `npx adl dashboard` (or `node_modules/.bin/adl dashboard`) — it works the same way on Node 22+.

Runs and chats persist in `.data/agent-dev-lab.sqlite`.
