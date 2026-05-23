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
  });
});
