# {{DISPLAY_NAME}}

ADL project scaffolded by `adl init`.

## Setup

```bash
bun install
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
adl workflow list
adl agent list
adl workflow run demo-counter --input '{"steps":3}'
adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
adl agent run assistant --input "What is Agent Dev Lab?"
```

Runs and chats persist in `.data/agent-dev-lab.sqlite`.
