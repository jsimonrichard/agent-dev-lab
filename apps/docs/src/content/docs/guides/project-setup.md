---
title: Project Setup
description: Start a new ADL project with adl init, the recommended way to get going.
---

An ADL **project** is any directory with `adl.config.*` at its root — that's the one thing the CLI, inspection UI, and `loadAdlProject()` all need to find it. The recommended way to create one is `adl init`, which scaffolds everything below for you.

Adding ADL to an _existing_ project instead, or want to know exactly what's required versus just conventional? See [Manual Setup](/guides/manual-setup/).

## Quick start

```bash
bunx @agent-dev-lab/cli init my-research
# or: npx @agent-dev-lab/cli init my-research
cd my-research
bun install
cp .env.example .env   # then set OPENAI_API_KEY
```

```bash
bunx adl workflow list
bunx adl agent list
bunx adl agent run assistant --input "What is Agent Dev Lab?"
bunx adl workflow run demo-counter --input '{"steps":3}'
bunx adl workflow run ask --input '{"question":"What is Agent Dev Lab?"}'
bunx adl dashboard
```

- **`adl init`** — scaffolds a project with SQLite-backed `src/adl.ts`, a README and tsconfig, demo-counter, a sample `ask` workflow, and `@agent-dev-lab/web` for `adl dashboard`.
- **`adl workflow run`** (`adl w run`) — `loadAdlProject()` → `getWorkflow(id).run(input)`
- **`adl agent run`** (`adl a run`) — `loadAdlProject()` → `getAgent(id).run({ user })` (`--input` is a string, not JSON)
- **`adl dashboard`** — [inspection UI](/guides/inspection-ui/); sets `ADL_PROJECT_ROOT`. Registry edits (agents, workflows, templates) hot-reload; restart after `.env*` edits, or when running `--serve`, which doesn't watch at all.

## What `adl init` gives you

```
my-research/
  package.json           # imports["#adl"] → ./src/adl.ts
  tsconfig.json          # paths["#adl"] → ./src/adl.ts
  adl.config.ts          # registry + metadata; sets config.adl
  .env.example
  src/
    adl.ts               # createAdlRuntime() — recommended runtime module
    model.ts
    agents/
      assistant.ts
    workflows/
      demo-counter.ts
      ask.ts
```

| Piece               | Role                                                                          |
| ------------------- | ----------------------------------------------------------------------------- |
| **`adl.config.ts`** | Registry (`agents[]`, `workflows[]`, …) and **`adl`** reference for tooling   |
| **`src/adl.ts`**    | `createAdlRuntime({ stores, observers })` — keeps config free of store wiring |
| **`#adl` alias**    | Registry modules `import { adl } from "#adl"` instead of a relative path      |

That's the recommended layout, not a requirement — see [Manual Setup](/guides/manual-setup/) for the minimum ADL actually needs and how the pieces wire together, useful if you're restructuring or adding ADL to an existing project.

### Environment variables

`loadAdlProject()` (and the inspection UI / CLI, which all go through it) loads `.env*` files from the **ADL project root** — the directory that contains `adl.config.*`, not the process cwd.

Direct `#adl` imports (for example `bun run start`) should call `loadAdlEnv()` before reading `process.env` at module load — the scaffold does this in `src/model.ts`. `createAdlRuntime({ loadEnv })` also loads env by default (`false` to opt out).

Precedence matches [Next.js](https://nextjs.org/docs/pages/guides/environment-variables) (highest first). Values already set in the process environment are never overwritten:

| File                | When it loads                          |
| ------------------- | -------------------------------------- |
| `.env.[mode].local` | Always, for that mode                  |
| `.env.local`        | All modes except `test`                |
| `.env.[mode]`       | `development`, `production`, or `test` |
| `.env`              | Always                                 |

`mode` is `NODE_ENV` when it is `development` / `production` / `test`, otherwise `development` (so `adl workflow run` still loads `.env.local`). Variable expansion (`$VAR`, `${VAR}`) is supported.

Put provider keys in `.env` or `.env.local` at the project root:

```bash
OPENAI_API_KEY=sk-...
ADL_MODEL=gpt-4o-mini
```

| Variable           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `OPENAI_API_KEY`   | Provider key for `@ai-sdk/openai` (sample agent)          |
| `ADL_SQLITE_PATH`  | SQLite file; relative paths resolve from the project root |
| `ADL_PROJECT_ROOT` | Override project discovery                                |
| `DEBUG=adl`        | Print CLI stack traces                                    |

`ADL_MODEL` isn't one of these — the framework doesn't read it. It's used in the scaffold's own `src/model.ts` to set ADL's default model.

See [Project Config](/core/project/) and [Runtime](/core/runtime/) for API detail.

## Templates (Handlebars)

`adl.createTemplate` renders markdown with **[Handlebars](https://handlebarsjs.com/)** after Zod validates the input.
Use `{{var}}`, `{{#each}}`, and friends. File templates need `from: import.meta.url` so relative paths resolve.

## Next steps

See [Gotchas](/guides/gotchas/) for sharp edges worth knowing about before they surprise you.
