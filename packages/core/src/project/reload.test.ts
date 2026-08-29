import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "bun:test";
import type { CoreMessage } from "ai";
import { createRequire } from "node:module";

import { AgentImpl } from "../agent/agent-impl";
import { loadAdlProject } from "./resolve";
import { watchAdlProject } from "./watch";
import { isIgnoredAdlProjectSegment, shouldReloadAdlProjectPath } from "./watch-path";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreImport = pathToFileURL(path.join(coreRoot, "index.ts")).href;
const zodImport = pathToFileURL(createRequire(import.meta.url).resolve("zod")).href;

type TempProject = {
  root: string;
  writeAgent: (systemPrompt: string) => Promise<void>;
  writeWorkflowSuffix: (suffix: string) => Promise<void>;
  writeWorkflowDefault: (defaultValue: string) => Promise<void>;
  writePrompt: (body: string) => Promise<void>;
  writeBrokenAgent: () => Promise<void>;
  writeAdlObserverVersion: (version: number) => Promise<void>;
};

async function createTempProject(options?: {
  observerVersion?: number;
  withTemplateAgent?: boolean;
}): Promise<TempProject> {
  const root = await mkdtemp(path.join(tmpdir(), "adl-reload-"));
  const srcDir = path.join(root, "src");
  await mkdir(srcDir, { recursive: true });

  const writeAdl = async (body: string) => {
    await writeFile(path.join(srcDir, "adl.ts"), body, "utf8");
  };

  const writeAdlObserverVersion = async (version: number) => {
    await writeAdl(`import { createAdlRuntime, inMemoryMessageStore, inMemoryWorkflowStore } from "${coreImport}";

export const adl = createAdlRuntime({
  stores: {
    message: inMemoryMessageStore(),
    workflow: inMemoryWorkflowStore(),
  },
  observers: {
    agents: [
      {
        onEvent: () => {
          globalThis.__adlReloadObserverVersion = ${version};
        },
      },
    ],
  },
});
`);
  };

  await writeAdlObserverVersion(options?.observerVersion ?? 0);

  await writeFile(
    path.join(srcDir, "agent.ts"),
    `import { adl } from "./adl";

export const testAgent = adl.createAgent({
  id: "test-agent",
  systemPrompt: "VERSION_A",
});
`,
    "utf8",
  );

  if (options?.withTemplateAgent) {
    await writeFile(path.join(srcDir, "prompt.md"), "PROMPT_A", "utf8");
    await writeFile(
      path.join(srcDir, "template-agent.ts"),
      `import { z } from "${zodImport}";
import { adl } from "./adl";

export const templateAgent = adl.createAgent({
  id: "template-agent",
  systemPrompt: adl.createTemplate({
    path: "./prompt.md",
    from: import.meta.url,
    inputData: z.object({}),
  }),
});
`,
      "utf8",
    );
  }

  await writeFile(
    path.join(srcDir, "workflow.ts"),
    `import { z } from "${zodImport}";
import { adl } from "./adl";

export const testWorkflow = adl.createWorkflow({
  id: "test-workflow",
  input: z.object({ value: z.string() }),
  output: z.object({ result: z.string() }),
  run: async (input) => ({ result: input.value + "_A" }),
});
`,
    "utf8",
  );

  const agentImports = options?.withTemplateAgent
    ? `import { testAgent } from "./src/agent";
import { templateAgent } from "./src/template-agent";`
    : `import { testAgent } from "./src/agent";`;

  const agentList = options?.withTemplateAgent ? "[testAgent, templateAgent]" : "[testAgent]";

  await writeFile(
    path.join(root, "adl.config.ts"),
    `import { adl } from "./src/adl";
${agentImports}
import { testWorkflow } from "./src/workflow";

export default {
  name: "reload-test",
  adl,
  agents: ${agentList},
  workflows: [testWorkflow],
};
`,
    "utf8",
  );

  return {
    root,
    writeAdlObserverVersion,
    writeAgent: async (systemPrompt: string) => {
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
    },
    writeWorkflowSuffix: async (suffix: string) => {
      await writeFile(
        path.join(srcDir, "workflow.ts"),
        `import { z } from "${zodImport}";
import { adl } from "./adl";

export const testWorkflow = adl.createWorkflow({
  id: "test-workflow",
  input: z.object({ value: z.string() }),
  output: z.object({ result: z.string() }),
  run: async (input) => ({ result: input.value + ${JSON.stringify(suffix)} }),
});
`,
        "utf8",
      );
    },
    writeWorkflowDefault: async (defaultValue: string) => {
      await writeFile(
        path.join(srcDir, "workflow.ts"),
        `import { z } from "${zodImport}";
import { adl } from "./adl";

const inputSchema = z.object({
  question: z.string().default(${JSON.stringify(defaultValue)}),
});

export const testWorkflow = adl.createWorkflow({
  id: "test-workflow",
  input: inputSchema,
  output: z.object({ answer: z.string() }),
  run: async (input) => {
    const { question } = inputSchema.parse(input);
    return { answer: question };
  },
});
`,
        "utf8",
      );
    },
    writePrompt: async (body: string) => {
      await writeFile(path.join(srcDir, "prompt.md"), body, "utf8");
    },
    writeBrokenAgent: async () => {
      await writeFile(path.join(srcDir, "agent.ts"), "export const testAgent = { broken", "utf8");
    },
  };
}

describe("shouldReloadAdlProjectPath", () => {
  it("accepts registry source files and rejects ignored dirs", () => {
    const root = "/project";
    expect(shouldReloadAdlProjectPath("/project/src/agents/a.ts", root)).toBe(true);
    expect(shouldReloadAdlProjectPath("/project/adl.config.ts", root)).toBe(true);
    expect(shouldReloadAdlProjectPath("/project/src/prompts/a.md", root)).toBe(true);
    expect(shouldReloadAdlProjectPath("/project/src/workflows/answer-question.ts.tmp", root)).toBe(
      true,
    );
    expect(
      shouldReloadAdlProjectPath("/project/src/workflows/answer-question.ts.12345.tmp", root),
    ).toBe(true);
    expect(shouldReloadAdlProjectPath("/project/src/workflows/answer-question.ts~", root)).toBe(
      true,
    );
    expect(shouldReloadAdlProjectPath("/project/src/notes.txt.tmp", root)).toBe(false);
    expect(shouldReloadAdlProjectPath("/project/node_modules/pkg/index.js", root)).toBe(false);
    expect(shouldReloadAdlProjectPath("/project/.data/agent-dev-lab.sqlite", root)).toBe(false);
    expect(shouldReloadAdlProjectPath("/project/.data/agent-dev-lab.sqlite-wal", root)).toBe(false);
    expect(shouldReloadAdlProjectPath("/project/dist/out.js", root)).toBe(false);
  });
});

describe("isIgnoredAdlProjectSegment", () => {
  it("matches watch-skip directory names", () => {
    expect(isIgnoredAdlProjectSegment("node_modules")).toBe(true);
    expect(isIgnoredAdlProjectSegment(".data")).toBe(true);
    expect(isIgnoredAdlProjectSegment("src")).toBe(false);
  });
});

describe("LoadedAdlProject.reload", () => {
  it(
    "swaps registry objects while pinning in-memory stores",
    async () => {
      const fixture = await createTempProject();
      const project = await loadAdlProject({ root: fixture.root });
      const agentBefore = project.getAgent("test-agent");
      const workflowBefore = project.getWorkflow("test-workflow");
      const storeBefore = project.getAdl().services.stores.message;

      const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
      await storeBefore.save("scope-1", messages);

      await fixture.writeAgent("VERSION_B");
      await project.reload();

      const agentAfter = project.getAgent("test-agent");
      const workflowAfter = project.getWorkflow("test-workflow");
      const storeAfter = project.getAdl().services.stores.message;

      expect(agentAfter).not.toBe(agentBefore);
      expect(workflowAfter).not.toBe(workflowBefore);
      expect(storeAfter).toBe(storeBefore);
      expect(await storeAfter.load("scope-1")).toEqual(messages);
      expect((agentAfter as AgentImpl).definition.systemPrompt).toBe("VERSION_B");

      const output = await workflowAfter!.run({ value: "x" }).result;
      expect(output).toEqual({ result: "x_A" });
      expect(project.generation).toBe(1);
      expect(project.lastReloadError).toBeNull();
    },
    { timeout: 20_000 },
  );

  it(
    "updates workflow run closures after reload",
    async () => {
      const fixture = await createTempProject();
      const project = await loadAdlProject({ root: fixture.root });

      await fixture.writeWorkflowSuffix("_B");
      await project.reload();

      const workflow = project.getWorkflow("test-workflow");
      const output = await workflow!.run({ value: "x" }).result;
      expect(output).toEqual({ result: "x_B" });
    },
    { timeout: 20_000 },
  );

  it(
    "reloads workflow input schemas so Zod defaults change",
    async () => {
      const fixture = await createTempProject();
      const project = await loadAdlProject({ root: fixture.root });

      await fixture.writeWorkflowDefault("default A");
      await project.reload();
      expect(project.getWorkflow("test-workflow")!.input!.parse({})).toEqual({
        question: "default A",
      });

      await fixture.writeWorkflowDefault("default B");
      await project.reload();
      expect(project.getWorkflow("test-workflow")!.input!.parse({})).toEqual({
        question: "default B",
      });
    },
    { timeout: 20_000 },
  );

  it(
    "re-reads prompt templates from disk",
    async () => {
      const fixture = await createTempProject({ withTemplateAgent: true });
      const project = await loadAdlProject({ root: fixture.root });
      const templateBefore = (project.getAgent("template-agent") as AgentImpl).definition
        .systemPrompt;
      expect(typeof templateBefore).toBe("object");
      expect((templateBefore as { render: (v: unknown) => string }).render({})).toBe("PROMPT_A");

      await fixture.writePrompt("PROMPT_B");
      await project.reload();

      const templateAfter = (project.getAgent("template-agent") as AgentImpl).definition
        .systemPrompt;
      expect((templateAfter as { render: (v: unknown) => string }).render({})).toBe("PROMPT_B");
    },
    { timeout: 20_000 },
  );

  it(
    "uses new runtime observers after reload",
    async () => {
      const fixture = await createTempProject({ observerVersion: 1 });
      const project = await loadAdlProject({ root: fixture.root });

      await fixture.writeAdlObserverVersion(2);
      await project.reload();

      const runtime = project.getAdl();
      runtime.services.observers.agents[0]?.onEvent?.({
        type: "agent_started",
        agentCallId: "call-1",
        agentId: "test-agent",
        memoryScope: "scope",
        seq: 1,
        at: new Date().toISOString(),
        eventSchemaVersion: 1,
      });

      expect(
        (globalThis as { __adlReloadObserverVersion?: number }).__adlReloadObserverVersion,
      ).toBe(2);
    },
    { timeout: 20_000 },
  );

  it(
    "keeps the previous registry when reload fails",
    async () => {
      const fixture = await createTempProject();
      const project = await loadAdlProject({ root: fixture.root });
      const agentBefore = project.getAgent("test-agent");

      await fixture.writeBrokenAgent();
      await expect(project.reload()).rejects.toThrow();

      expect(project.getAgent("test-agent")).toBe(agentBefore);
      expect(project.generation).toBe(0);
      expect(project.lastReloadError).toBeTruthy();

      await fixture.writeAgent("VERSION_RECOVERED");
      await project.reload();
      expect(project.getAgent("test-agent")).not.toBe(agentBefore);
      expect((project.getAgent("test-agent") as AgentImpl).definition.systemPrompt).toBe(
        "VERSION_RECOVERED",
      );
      expect(project.lastReloadError).toBeNull();
    },
    { timeout: 20_000 },
  );
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("watchAdlProject", () => {
  // Nested playground-like registry coverage lives in watch.integration.test.ts.
  it(
    "reloads when a watched registry file changes",
    async () => {
      const fixture = await createTempProject();
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
        await wait(25);
        await fixture.writeAgent("VERSION_WATCHED");
        await expect(reloaded.promise).resolves.toBe(1);
        expect((project.getAgent("test-agent") as AgentImpl).definition.systemPrompt).toBe(
          "VERSION_WATCHED",
        );
      } finally {
        dispose();
      }
    },
    { timeout: 10_000 },
  );

  it(
    "does not reload for ignored trees",
    async () => {
      const fixture = await createTempProject();
      await mkdir(path.join(fixture.root, "node_modules"), { recursive: true });
      await mkdir(path.join(fixture.root, ".data"), { recursive: true });
      const project = await loadAdlProject({ root: fixture.root });
      let reloads = 0;
      const dispose = watchAdlProject(project, {
        onReload: () => {
          reloads += 1;
        },
      });

      try {
        await wait(25);
        await writeFile(path.join(fixture.root, "node_modules", "pkg.ts"), "export {}", "utf8");
        await writeFile(path.join(fixture.root, ".data", "note.ts"), "export {}", "utf8");
        await wait(400);
        expect(reloads).toBe(0);
        expect(project.generation).toBe(0);
      } finally {
        dispose();
      }
    },
    { timeout: 10_000 },
  );

  it(
    "reloads after an atomic temp-file save",
    async () => {
      const fixture = await createTempProject();
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
        await wait(25);
        const target = path.join(fixture.root, "src", "agent.ts");
        const tmp = `${target}.12345.tmp`;
        await writeFile(
          tmp,
          `import { adl } from "./adl";

export const testAgent = adl.createAgent({
  id: "test-agent",
  systemPrompt: "VERSION_ATOMIC",
});
`,
          "utf8",
        );
        await rename(tmp, target);
        await expect(reloaded.promise).resolves.toBe(1);
        expect((project.getAgent("test-agent") as AgentImpl).definition.systemPrompt).toBe(
          "VERSION_ATOMIC",
        );
      } finally {
        dispose();
      }
    },
    { timeout: 10_000 },
  );

  it(
    "does not emit onReload after dispose",
    async () => {
      const fixture = await createTempProject();
      const project = await loadAdlProject({ root: fixture.root });
      let reloads = 0;
      const dispose = watchAdlProject(project, {
        onReload: () => {
          reloads += 1;
        },
      });
      dispose();

      await fixture.writeAgent("VERSION_AFTER_DISPOSE");
      await wait(400);
      expect(reloads).toBe(0);
      expect(project.generation).toBe(0);
    },
    { timeout: 10_000 },
  );
});
