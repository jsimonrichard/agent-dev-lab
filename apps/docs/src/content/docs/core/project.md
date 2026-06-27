---
title: Project config
description: adl.config.ts shape, loadAdlProject, and execution entrypoints.
---

The project config module is the **discovery surface** for CLI, inspection UI, and `loadAdlProject()`. Implementations live in arbitrary paths; only `adl.config.*` is the registry.

## Design decisions

- **Static registry** at load time — no dynamic registration or runtime plugin scan.
- **Arrays** of definitions; each carries its own **`id`** (agents/workflows) or **`name`** (templates from filename).
- **JSON config** (`adl.config.json`) suits `name` + paths only — registries need TS/JS for imports.

## AdlProjectConfig

```ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";

export default {
  name: "my-research",

  /** Process runtime from src/adl.ts — stores/observers live there */
  adl,

  agents: [researcher, writer],
  workflows: [literatureReview, quickSummary],
  templates: [findPapersPrompt, outlinePrompt],

  tools: {
    /* shared AI SDK ToolSet */
  },
  defaults: {
    /* optional project-wide defaults — TBD */
  },
} satisfies AdlProjectConfig;
```

Validation at load time:

- `name` required
- Unique **`id`** per agent/workflow (throws on duplicate)
- Unique **`name`** per template (throws on duplicate)

## loadAdlProject

```ts
export interface LoadedAdlProject {
  root: string;
  configPath: string;
  config: AdlProjectConfig;

  getWorkflow(id: string): Workflow | undefined;
  getAgent(id: string): Agent | undefined;
  listWorkflowIds(): string[];
  listAgentIds(): string[];
  getTemplate(name: string): Template | undefined;
  listTemplateNames(): string[];
}
```

Discovery walks upward from cwd for `adl.config.*` (`findAdlProjectRootFromCwd`) or accepts an explicit root via `ADL_PROJECT_ROOT`.

## Execution

**One primitive:** `workflow.run(input)` — no separate `runWorkflow()` helper.

| Entry                     | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| **`workflow.run(input)`** | The execution primitive                            |
| **`adl run <id>`**        | Planned: load project → `getWorkflow(id).run(...)` |
| **`adl dev` / UI**        | Planned: list ids + trigger by id                  |
| **Direct import**         | Skip registry; still use `.run`                    |

```ts
// By reference
const handle = literatureReview.run({ topic: "CRISPR delivery" });
const output = await handle.result;

// By id after loadAdlProject
const workflow = project.getWorkflow("literature-review");
const handle = workflow!.run({ topic: "CRISPR delivery" });
```

### WorkflowRunHandle

- **`workflowRunId`** — available immediately for store subscription / future SSE
- **`result`** — `Promise<Output>`
- **`cancel()`** — cooperative cancellation (partial propagation today)

Authors receive `WorkflowContext` inside `createWorkflow({ run: async (input, ctx) => … })`.

## CLI (planned)

```bash
adl run literature-review --input '{"topic":"…"}'
adl workflows list
adl agents list
```

**Implemented today:** `adl dev` only.

## Why registries stay static

| Scenario                         | Approach                                               |
| -------------------------------- | ------------------------------------------------------ |
| Different models per environment | `defaults` or env in `adl.config.ts`                   |
| A/B two workflows                | List both; choose at CLI or `getWorkflow(id).run(...)` |
| Monorepo multiple projects       | Multiple roots; `loadAdlProject({ root })` each        |

See [Project setup](/guides/project-setup/) and [Runtime](/core/runtime/).
