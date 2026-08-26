# Playground

Hardcoded ADL project used when developing the inspection UI (`apps/web`) and CLI (`apps/cli`) inside the monorepo. It doubles as a worked example of the framework's features using **real AI agents on the Vercel AI SDK**.

## What it demonstrates

| Concept                             | Where                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Agents (`adl.createAgent`)          | `src/agents/` — outliner, writer, editor, research-assistant, researcher, critic |
| Structured output (Zod schema)      | `outliner` (outline), `editor` (review)                                          |
| Instruction + request templates     | `src/prompts/` — file-based (`outliner.md`) and inline templates                 |
| Tools (`tool` + tool loop)          | `src/tools/knowledge.ts` + `answer-question` workflow                            |
| Multi-agent workflow                | `src/workflows/write-article.ts` (outline → draft → review → revise)             |
| Parallel agent step                 | `src/workflows/literature-review.ts` (researcher + critic)                       |
| Workflow tool loop in TypeScript    | `src/workflows/answer-question.ts`                                               |
| Steps, `memoryScope`, custom events | LLM workflows                                                                    |
| SQLite persistence                  | `src/adl.ts` — `.data/agent-dev-lab.sqlite`                                      |
| No-LLM workflow (baseline)          | `src/workflows/demo-counter.ts`                                                  |

### Registry

`adl.config.ts` registers everything so the inspection UI and CLI can discover it:

- **agents:** `outliner`, `writer`, `editor`, `research-assistant`, `researcher`, `critic`
- **workflows:** `demo-counter`, `write-article`, `answer-question`, `literature-review`
- **templates:** `outliner`, `article-brief`, `draft-request`, `revise-request`

## Model & API key

Every agent uses one shared model from `src/model.ts` (`@ai-sdk/openai`). The OpenAI
provider reads the key lazily, so the project loads fine without one — agents only fail
when actually executed.

Configure via a `.env` file (loaded by `src/env.ts` for `bun run start`, the inspection
UI, and the CLI) or via real environment variables (which take precedence):

```bash
cp .env.example .env
# then edit .env:
#   OPENAI_API_KEY=sk-...
#   ADL_OPENAI_MODEL=gpt-5.5   # optional, default: gpt-5.4-mini
```

`.env` / `.env.local` are gitignored; `.env.example` documents the supported variables.

## Run

```bash
# no key needed — runs the no-LLM demo-counter workflow and prints the registry
bun run start
adl run demo-counter --input '{"steps":3}'

# with OPENAI_API_KEY set — run an AI workflow end-to-end with a live event trace
bun run start answer-question
bun run start write-article
bun run start literature-review
```

From the repo root, `bun run dev:web` points the inspection UI at this directory via
`ADL_PROJECT_ROOT` and loads `.env*` from here (not `apps/web`). The registered
workflows and agents appear there to start and inspect.

## Layout

```
adl.config.ts          # registry (agents, workflows, templates) + runtime
src/
  adl.ts               # createAdlRuntime() with SQLite stores
  model.ts             # shared OpenAI model from env
  main.ts              # CLI demo runner with a live event trace
  agents/              # outliner, writer, editor, research-assistant, researcher, critic
  prompts/             # instruction + request templates (incl. outliner.md)
  tools/               # knowledge-base lookup + safe calculator
  workflows/           # demo-counter, write-article, answer-question, literature-review
.adl/                  # local project state (gitignored)
.data/                 # SQLite store (gitignored)
```
