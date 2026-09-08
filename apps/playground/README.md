# Playground

Hardcoded ADL project used when developing the inspection UI (`apps/web`) and CLI (`apps/cli`) inside the monorepo. It doubles as a worked example of the framework's features using **real AI agents on the Vercel AI SDK**.

## What it demonstrates

| Concept                                               | Where                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents (`adl.createAgent`)                            | `src/agents/` — outliner, writer, editor, drafter, reviser, research-assistant, researcher, critic, sandbox-agent, sandbox-agent-native                                                                                                                       |
| Structured output (Zod schema)                        | `outliner` (outline), `editor` (review)                                                                                                                                                                                                                       |
| Instruction + request templates                       | `src/prompts/` — file-based (`outliner.md`) and inline templates                                                                                                                                                                                              |
| Tools (`tool` + tool loop)                            | `src/tools/knowledge.ts` + `answer-question` workflow                                                                                                                                                                                                         |
| Sandboxed workspace tools (`@agent-dev-lab/tools`)    | `src/tools/sandbox.ts` + `sandbox-demo` workflow (ASRT and native `bwrap` executors, per-run `cwd` via `toolProviderContext`, an AI-based `bash-safety-check` workflow)                                                                                       |
| `fetchUrl` tool + SSRF guard (`@agent-dev-lab/tools`) | `src/tools/fetch-fixture.ts` + `fetch-url-demo` workflow — deterministic checks (no LLM) against a local fixture: blocked with no `allowedUrls`, a glob scoped to one path, a `RegExp` entry, and a redirect that still escapes a broad same-origin exemption |
| Multi-agent workflow                                  | `src/workflows/write-article.ts` (outline → draft → review → revise)                                                                                                                                                                                          |
| Optional scope, `messages`, handoff                   | `src/workflows/shared-scope.ts` (drafter → reviser on one `memoryScope`)                                                                                                                                                                                      |
| Parallel agent step                                   | `src/workflows/literature-review.ts` (researcher + critic)                                                                                                                                                                                                    |
| Workflow tool loop in TypeScript                      | `src/workflows/answer-question.ts`                                                                                                                                                                                                                            |
| Steps, `memoryScope`, `ctx.emit(name, payload?)`      | LLM workflows                                                                                                                                                                                                                                                 |
| SQLite persistence                                    | `src/adl.ts` — `.data/agent-dev-lab.sqlite`                                                                                                                                                                                                                   |
| No-LLM workflow (baseline)                            | `src/workflows/demo-counter.ts`                                                                                                                                                                                                                               |

### Registry

`adl.config.ts` registers everything so the inspection UI and CLI can discover it:

- **agents:** `outliner`, `writer`, `editor`, `drafter`, `reviser`, `research-assistant`, `researcher`, `critic`, `sandbox-agent`, `sandbox-agent-native`
- **workflows:** `demo-counter`, `write-article`, `answer-question`, `literature-review`, `shared-scope`, `sandbox-demo`, `fetch-url-demo`
- **templates:** `outliner`, `article-brief`, `draft-request`, `revise-request`

## Model & API key

Every agent uses one shared model from `src/model.ts` (`@ai-sdk/openai`). The OpenAI
provider reads the key lazily, so the project loads fine without one — agents only fail
when actually executed.

Configure via a `.env` file (loaded by `loadAdlEnv()` in `src/model.ts` /
`createAdlRuntime`, and by `loadAdlProject` for the inspection UI and CLI) or via
real environment variables (which take precedence):

```bash
cp .env.example .env
# then edit .env:
#   OPENAI_API_KEY=sk-...
#   ADL_MODEL=gpt-5.5   # optional, default: gpt-5.4-mini
```

`.env` / `.env.local` are gitignored; `.env.example` documents the supported variables.

## Run

```bash
# no key needed — runs the no-LLM demo-counter workflow and prints the registry
bun run start
adl workflow run demo-counter --input '{"steps":3}'
adl agent run research-assistant --input "What is Agent Dev Lab?"

# Inspection UI for this project (from apps/playground)
bun run dashboard

# with OPENAI_API_KEY set — run an AI workflow end-to-end with a live event trace
bun run start answer-question
bun run start write-article
bun run start literature-review

# @agent-dev-lab/tools sandboxed workspace tools (needs bwrap on PATH; the "asrt" backend
# additionally needs socat + ripgrep — see notes/tool-sandboxing.md). "asrt" also runs every
# command through the bash-safety-check workflow first (an AI-based check on top of the
# OS sandbox); "subdir" demonstrates a per-run cwd via toolProviderContext.
adl workflow run sandbox-demo --input '{"backend":"asrt"}'
adl workflow run sandbox-demo --input '{"backend":"asrt","subdir":"run-1"}'
adl workflow run sandbox-demo --input '{"backend":"native"}'

# @agent-dev-lab/tools' fetchUrl tool + SSRF guard (allowedUrls glob/regex scoping) — no key,
# no network needed; runs deterministic checks against a local fixture and fails loudly (throws,
# naming the mismatch) if the guard doesn't behave as expected. "probePublicUrl" is an optional,
# purely informational extra check that a real URL is reachable with fetchUrl's default policy.
adl workflow run fetch-url-demo --input '{}'
adl workflow run fetch-url-demo --input '{"probePublicUrl":"https://example.com/"}'
```

From the repo root, `bun run dev:web` points the framework inspection UI at this directory via
`ADL_FRAMEWORK_DEV=1` (playground default). `bun run dashboard` here runs `adl dashboard` against this
project the same way an `adl init` project would (`adl init` copies a dedicated scaffold, not this playground).

## Layout

```
adl.config.ts          # registry (agents, workflows, templates) + runtime
src/
  adl.ts               # createAdlRuntime() with SQLite stores
  model.ts             # shared OpenAI model from env
  main.ts              # CLI demo runner with a live event trace
  agents/              # outliner, writer, editor, drafter, reviser, research-assistant, researcher, critic, sandbox-agent(-native)
  prompts/             # instruction + request templates (incl. outliner.md)
  tools/               # knowledge-base lookup + safe calculator; sandbox.ts, fetch-fixture.ts (@agent-dev-lab/tools)
  workflows/           # demo-counter, write-article, answer-question, literature-review, shared-scope, sandbox-demo, fetch-url-demo
.adl/                  # local project state (gitignored)
.data/                 # SQLite store (gitignored)
```
