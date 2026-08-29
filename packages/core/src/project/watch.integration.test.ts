import { createServer } from "node:net";
import { mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "bun:test";

import { loadAdlProject } from "./resolve";
import { watchAdlProject } from "./watch";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const corePkg = path.join(repoRoot, "packages/core");
const webPkg = path.join(repoRoot, "apps/web");
const zodPkg = path.dirname(createRequire(import.meta.url).resolve("zod/package.json"));

type PlaygroundLikeProject = {
  root: string;
  workflowPath: string;
  writeWorkflow: (version: string, options?: { atomic?: boolean }) => Promise<void>;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await wait(40);
  }
  throw new Error(message);
}

function workflowSource(version: string): string {
  return `import { z } from "zod";
import { adl } from "#adl";

export const answerQuestion = adl.createWorkflow({
  id: "answer-question",
  input: z.object({
    question: z.string().default(${JSON.stringify(`default ${version}`)}),
  }),
  output: z.object({ result: z.string() }),
  run: async (input) => ({ result: input.question + ${JSON.stringify(`_${version}`)} }),
});
`;
}

async function createPlaygroundLikeProject(): Promise<PlaygroundLikeProject> {
  const root = await mkdtemp(path.join(tmpdir(), "adl-watch-e2e-"));
  const srcDir = path.join(root, "src");
  const workflowsDir = path.join(srcDir, "workflows");
  await mkdir(workflowsDir, { recursive: true });

  mkdirSync(path.join(root, "node_modules/@agent-dev-lab"), { recursive: true });
  symlinkSync(corePkg, path.join(root, "node_modules/@agent-dev-lab/core"));
  symlinkSync(zodPkg, path.join(root, "node_modules/zod"));

  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "adl-watch-e2e",
      type: "module",
      imports: { "#adl": "./src/adl.ts" },
    }),
    "utf8",
  );

  writeFileSync(
    path.join(srcDir, "adl.ts"),
    `import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "@agent-dev-lab/core";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
});
`,
    "utf8",
  );

  const workflowPath = path.join(workflowsDir, "answer-question.ts");

  const writeWorkflow = async (version: string, options?: { atomic?: boolean }) => {
    const contents = workflowSource(version);
    if (!options?.atomic) {
      await writeFile(workflowPath, contents, "utf8");
      return;
    }
    const tmpPath = `${workflowPath}.${process.pid}.tmp`;
    await writeFile(tmpPath, contents, "utf8");
    await rename(tmpPath, workflowPath);
  };

  await writeWorkflow("A");
  await writeFile(
    path.join(root, "adl.config.ts"),
    `import { adl } from "#adl";
import { answerQuestion } from "./src/workflows/answer-question";

export default {
  name: "watch-e2e",
  adl,
  workflows: [answerQuestion],
};
`,
    "utf8",
  );

  return { root, workflowPath, writeWorkflow };
}

function workflowQuestion(project: Awaited<ReturnType<typeof loadAdlProject>>): string {
  const parsed = project.getWorkflow("answer-question")!.input!.parse({}) as {
    question: string;
  };
  return parsed.question;
}

async function workflowResult(
  project: Awaited<ReturnType<typeof loadAdlProject>>,
  question: string,
): Promise<string> {
  const output = await project.getWorkflow("answer-question")!.run({ question }).result;
  return (output as { result: string }).result;
}

describe("watchAdlProject integration (playground-like nested registry)", () => {
  it(
    "reloads when a nested src/workflows/*.ts file is edited in place",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      const project = await loadAdlProject({ root: fixture.root });
      const reloaded = Promise.withResolvers<number>();
      const dispose = watchAdlProject(project, {
        onReload: ({ generation }) => {
          reloaded.resolve(generation);
        },
        onError: (error) => {
          reloaded.reject(error);
        },
      });

      try {
        await wait(40);
        await fixture.writeWorkflow("B");
        await expect(reloaded.promise).resolves.toBe(1);
        expect(workflowQuestion(project)).toBe("default B");
        expect(await workflowResult(project, "q")).toBe("q_B");
      } finally {
        dispose();
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );

  it(
    "reloads when a nested workflow is saved atomically (temp + rename)",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      const project = await loadAdlProject({ root: fixture.root });
      const reloaded = Promise.withResolvers<number>();
      const dispose = watchAdlProject(project, {
        onReload: ({ generation }) => {
          reloaded.resolve(generation);
        },
        onError: (error) => {
          reloaded.reject(error);
        },
      });

      try {
        await wait(40);
        await fixture.writeWorkflow("C", { atomic: true });
        await expect(reloaded.promise).resolves.toBe(1);
        expect(workflowQuestion(project)).toBe("default C");
        expect(await workflowResult(project, "q")).toBe("q_C");
      } finally {
        dispose();
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );

  it(
    "re-evaluates nested #adl modules after reload even if Bun already imported the config",
    async () => {
      const fixture = await createPlaygroundLikeProject();
      try {
        await import(pathToFileURL(path.join(fixture.root, "adl.config.ts")).href);
        const project = await loadAdlProject({ root: fixture.root });
        expect(workflowQuestion(project)).toBe("default A");

        await fixture.writeWorkflow("D");
        await project.reload();

        expect(project.generation).toBe(1);
        expect(workflowQuestion(project)).toBe("default D");
        expect(await workflowResult(project, "q")).toBe("q_D");
      } finally {
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );
});

