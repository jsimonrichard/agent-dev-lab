---
title: Project setup
description: Layout an ADL project with adl.config.ts, src/adl.ts, and registry arrays.
---

An ADL **project** is a directory with `adl.config.*` at the root. The config file is the discovery surface for the CLI and inspection UI; implementations live in arbitrary paths under `src/`.

## Layout

```
my-research/
  adl.config.ts          # registry + project metadata
  src/
    adl.ts               # runtime (stores, observers)
    agents/researcher.ts
    workflows/literature-review.ts
    prompts/…
```

## Runtime vs config

| File                | Role                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| **`adl.config.ts`** | Static **registry**: `name`, `agents[]`, `workflows[]`, `templates[]`, plus an **`adl`** reference |
| **`src/adl.ts`**    | **Runtime** construction: `MessageStore`, `WorkflowStore`, observers                               |

Registry modules import `adl` from `src/adl.ts` and call `adl.createAgent({ … })`. The config imports those definitions — **no import cycle** as long as `adl.ts` does not import `adl.config.ts`.

```ts
// src/adl.ts
import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});
```

```ts
// adl.config.ts
import type { AdlProjectConfig } from "@agent-dev-lab/core";
import { adl } from "./src/adl";
import { researcher } from "./src/agents/researcher";
import { literatureReview } from "./src/workflows/literature-review";

export default {
  name: "my-research",
  adl,
  agents: [researcher],
  workflows: [literatureReview],
} satisfies AdlProjectConfig;
```

**Do not** put store construction in `adl.config.ts`. **Do** export full TypeScript agent/workflow/template objects in the registry arrays.

## Loading a project

```ts
import { loadAdlProject } from "@agent-dev-lab/core";

const project = await loadAdlProject();
const workflow = project.getWorkflow("literature-review");
if (!workflow) throw new Error("Unknown workflow");

const handle = workflow.run({ topic: "CRISPR delivery" });
const output = await handle.result;
```

`loadAdlProject` builds indexes by `definition.id` (agents/workflows) and `template.name` (filename basename). Duplicate ids throw at load time.

## CLI today

- **`adl dev`** — starts the inspection UI against the nearest `adl.config.*` from cwd.
- **`adl run`** / **`adl workflows list`** — planned; not implemented yet.

See [Project config](/core/project/) and [Runtime](/core/runtime/) for API detail.
