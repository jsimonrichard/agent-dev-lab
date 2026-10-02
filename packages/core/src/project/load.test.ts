import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "bun:test";

import { loadAdlProject } from "./resolve";

const playgroundRoot = path.resolve(
  fileURLToPath(new URL("../../../../apps/playground", import.meta.url)),
);
const coreEntryUrl = pathToFileURL(
  path.resolve(fileURLToPath(new URL("../index.ts", import.meta.url))),
).href;

describe("loadAdlProject", () => {
  it("loads apps/playground adl.config.ts", async () => {
    const project = await loadAdlProject({ root: playgroundRoot });
    expect(project.config.name).toBe("playground");
    expect(project.configPath).toEndWith("adl.config.ts");
    const adl = project.config.adl;
    if (!adl) {
      throw new Error("expected playground config to define adl");
    }
    expect(project.getAdl()).toBe(adl);
  });

  it("rejects duplicate agent ids", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-dup-agent-"));
    await writeFile(
      path.join(dir, "adl.config.ts"),
      `
import { createAdlRuntime } from ${JSON.stringify(coreEntryUrl)};

const adl = createAdlRuntime({ loadEnv: false });
const a = adl.createAgent({ id: "dup", systemPrompt: "one" });
const b = adl.createAgent({ id: "dup", systemPrompt: "two" });
export default { name: "dup-agents", adl, agents: [a, b] };
`,
    );

    await expect(loadAdlProject({ root: dir })).rejects.toThrow(/Duplicate agent id "dup"/);
  });

  it("rejects duplicate workflow ids", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-dup-wf-"));
    await writeFile(
      path.join(dir, "adl.config.ts"),
      `
import { createAdlRuntime } from ${JSON.stringify(coreEntryUrl)};

const adl = createAdlRuntime({ loadEnv: false });
const a = adl.createWorkflow({ id: "dup", run: async () => ({}) });
const b = adl.createWorkflow({ id: "dup", run: async () => ({}) });
export default { name: "dup-workflows", adl, workflows: [a, b] };
`,
    );

    await expect(loadAdlProject({ root: dir })).rejects.toThrow(/Duplicate workflow id "dup"/);
  });

  it("indexes model catalog entries and rejects duplicates / missing factory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-models-"));
    await writeFile(
      path.join(dir, "adl.config.ts"),
      `
import { createAdlRuntime } from ${JSON.stringify(coreEntryUrl)};

const adl = createAdlRuntime({ loadEnv: false });
const fakeModel = { modelId: "test-model", provider: "test" };
export default {
  name: "models-ok",
  adl,
  models: [
    {
      id: "mini",
      label: "Mini",
      provider: "test",
      apiKeyEnv: "TEST_API_KEY",
      factory: () => fakeModel,
    },
  ],
};
`,
    );

    const project = await loadAdlProject({ root: dir });
    expect(project.listModelIds()).toEqual(["mini"]);
    expect(project.getModel("mini")?.label).toBe("Mini");
    expect(project.getModel("mini")?.apiKeyEnv).toBe("TEST_API_KEY");
    expect(project.getModel("missing")).toBeUndefined();

    const dupDir = await mkdtemp(path.join(tmpdir(), "adl-dup-model-"));
    await writeFile(
      path.join(dupDir, "adl.config.ts"),
      `
import { createAdlRuntime } from ${JSON.stringify(coreEntryUrl)};
const adl = createAdlRuntime({ loadEnv: false });
const fakeModel = { modelId: "x", provider: "test" };
export default {
  name: "dup-models",
  adl,
  models: [
    { id: "dup", label: "A", provider: "test", factory: () => fakeModel },
    { id: "dup", label: "B", provider: "test", factory: () => fakeModel },
  ],
};
`,
    );
    await expect(loadAdlProject({ root: dupDir })).rejects.toThrow(
      /Duplicate model catalog id "dup"/,
    );

    const noFactoryDir = await mkdtemp(path.join(tmpdir(), "adl-nofactory-"));
    await writeFile(
      path.join(noFactoryDir, "adl.config.json"),
      JSON.stringify({
        name: "json-models",
        models: [{ id: "x", label: "X", provider: "test" }],
      }),
    );
    await expect(loadAdlProject({ root: noFactoryDir })).rejects.toThrow(/factory/);
  });
});

describe("findAdlProjectRootFromCwd", () => {
  it("finds apps/playground when cwd is inside it", async () => {
    const { findAdlProjectRootFromCwd } = await import("./resolve");
    const root = findAdlProjectRootFromCwd(path.join(playgroundRoot, "src"));
    expect(root).toBe(playgroundRoot);
  });
});
