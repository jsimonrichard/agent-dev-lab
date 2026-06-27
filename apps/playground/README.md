# Playground

Hardcoded ADL project used when developing the inspection UI (`apps/web`) and CLI (`apps/cli`) inside the monorepo. It doubles as a worked example of the framework's features using **real AI agents on the Vercel AI SDK**.

## What it demonstrates

| Concept                             | Where                                                                |
| ----------------------------------- | -------------------------------------------------------------------- |
| Agents (`adl.createAgent`)          | `src/agents/` — outliner, writer, editor, research-assistant         |
| Structured output (Zod schema)      | `outliner` (outline), `editor` (review)                              |
| Instruction + request templates     | `src/prompts/` — file-based (`outliner.md`) and inline templates     |
| Tools (`tool` + tool loop)          | `src/tools/knowledge.ts` + `answer-question` workflow                |
| Multi-agent workflow                | `src/workflows/write-article.ts` (outline → draft → review → revise) |
| Workflow tool loop in TypeScript    | `src/workflows/answer-question.ts`                                   |
| Steps, `memoryScope`, custom events | both LLM workflows                                                   |
| No-LLM workflow (baseline)          | `src/workflows/demo-counter.ts`                                      |

### Registry

`adl.config.ts` registers everything so the inspection UI and CLI can discover it:

- **agents:** `outliner`, `writer`, `editor`, `research-assistant`
- **workflows:** `demo-counter`, `write-article`, `answer-question`
- **templates:** `outliner`, `article-brief`, `draft-request`, `revise-request`

## Model & API key

Every agent uses one shared model from `src/model.ts` (`@ai-sdk/openai`). The OpenAI
provider reads the key lazily, so the project loads fine without one — agents only fail
when actually executed.

```bash
export OPENAI_API_KEY=sk-...
# optional: pick a different model (default: gpt-5.4-mini)
export ADL_OPENAI_MODEL=gpt-5.5
```

## Run

```bash
# no key needed — runs the no-LLM demo-counter workflow and prints the registry
bun run start

# with OPENAI_API_KEY set — run an AI workflow end-to-end with a live event trace
bun run start answer-question
bun run start write-article
```

From the repo root, `bun run dev:web` points the inspection UI at this directory via
`ADL_PROJECT_ROOT`; the registered workflows and agents appear there to start and inspect.

## Layout

```
adl.config.ts          # registry (agents, workflows, templates) + runtime
src/
  adl.ts               # createAdlRuntime()
  model.ts             # shared OpenAI model from env
  main.ts              # CLI demo runner with a live event trace
  agents/              # outliner, writer, editor, research-assistant
  prompts/             # instruction + request templates (incl. outliner.md)
  tools/               # knowledge-base lookup + safe calculator
  workflows/           # demo-counter, write-article, answer-question
.adl/                  # local project state (gitignored)
```
