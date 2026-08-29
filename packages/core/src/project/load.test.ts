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
});

describe("findAdlProjectRootFromCwd", () => {
  it("finds apps/playground when cwd is inside it", async () => {
    const { findAdlProjectRootFromCwd } = await import("./resolve");
    const root = findAdlProjectRootFromCwd(path.join(playgroundRoot, "src"));
    expect(root).toBe(playgroundRoot);
  });
});
