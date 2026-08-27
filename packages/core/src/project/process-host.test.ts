import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";

import { afterEach, describe, expect, it } from "bun:test";

import { AgentImpl } from "../agent/agent-impl";
import {
  acquireAdlProject,
  ensureAdlProjectFileWatch,
  resetAdlProjectProcessHost,
  subscribeAdlProjectHostReload,
} from "./process-host";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreImport = pathToFileURL(path.join(coreRoot, "index.ts")).href;
const zodImport = pathToFileURL(createRequire(import.meta.url).resolve("zod")).href;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createHostProject(): Promise<{
  root: string;
  writeAgent: (systemPrompt: string) => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "adl-process-host-"));
  const srcDir = path.join(root, "src");
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    path.join(srcDir, "adl.ts"),
    `import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "${coreImport}";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});
`,
    "utf8",
  );

  const writeAgent = async (systemPrompt: string) => {
    await writeFile(
      path.join(srcDir, "agent.ts"),
      `import { adl } from "./adl";

export const testAgent = adl.createAgent({
  id: "test-agent",
  systemPrompt: ${JSON.stringify(systemPrompt)},
});
`,
      "utf8",
    );
  };

  await writeAgent("VERSION_A");
  await writeFile(
    path.join(srcDir, "workflow.ts"),
    `import { z } from "${zodImport}";
import { adl } from "./adl";

export const testWorkflow = adl.createWorkflow({
  id: "test-workflow",
  input: z.object({ value: z.string() }),
  output: z.object({ result: z.string() }),
  run: async (input) => ({ result: input.value }),
});
`,
    "utf8",
  );
  await writeFile(
    path.join(root, "adl.config.ts"),
    `import { adl } from "./src/adl";
import { testAgent } from "./src/agent";
import { testWorkflow } from "./src/workflow";

export default {
  name: "process-host-test",
  adl,
  agents: [testAgent],
  workflows: [testWorkflow],
};
`,
    "utf8",
  );

  return { root, writeAgent };
}

afterEach(() => {
  resetAdlProjectProcessHost();
});

describe("adl project process host", () => {
  it(
    "reuses one LoadedAdlProject so a later acquire sees a watch reload",
    async () => {
      const fixture = await createHostProject();
      try {
        const first = await acquireAdlProject(fixture.root);
        const reloaded = Promise.withResolvers<number>();
        const unsubscribe = subscribeAdlProjectHostReload((event) => {
          if (event.type === "reload") {
            reloaded.resolve(event.generation);
          }
        });
        ensureAdlProjectFileWatch(true);

        try {
          await wait(40);
          await fixture.writeAgent("VERSION_B");
          await expect(reloaded.promise).resolves.toBe(1);

          const second = await acquireAdlProject(fixture.root);
          expect(second).toBe(first);
          expect(second.generation).toBe(1);
          expect((second.getAgent("test-agent") as AgentImpl).definition.systemPrompt).toBe(
            "VERSION_B",
          );
        } finally {
          unsubscribe();
        }
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );
});
