import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

import { loadAdlProject } from "./resolve";

const playgroundRoot = path.resolve(
  fileURLToPath(new URL("../../../../apps/playground", import.meta.url)),
);

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
});

describe("findAdlProjectRootFromCwd", () => {
  it("finds apps/playground when cwd is inside it", async () => {
    const { findAdlProjectRootFromCwd } = await import("./resolve");
    const root = findAdlProjectRootFromCwd(path.join(playgroundRoot, "src"));
    expect(root).toBe(playgroundRoot);
  });
});
