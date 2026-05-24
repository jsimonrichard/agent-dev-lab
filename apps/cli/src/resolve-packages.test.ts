import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

import {
  findMonorepoRoot,
  resolveFromProjectRoot,
  resolveWorkspacePackageRoot,
} from "./resolve-packages";

const cliSrcDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const monorepoRoot = path.resolve(cliSrcDir, "../..");
const playgroundRoot = path.join(monorepoRoot, "apps/playground");

describe("resolveWorkspacePackageRoot", () => {
  it("finds monorepo root from the CLI package", () => {
    const root = findMonorepoRoot(cliSrcDir);
    expect(root).toBe(monorepoRoot);
  });

  it("resolves web and playground from monorepo layout", () => {
    const web = resolveWorkspacePackageRoot("@agent-dev-lab/web");
    const playground = resolveWorkspacePackageRoot("@agent-dev-lab/playground");
    expect(web).toEndWith(`${path.sep}apps${path.sep}web`);
    expect(playground).toEndWith(`${path.sep}apps${path.sep}playground`);
  });
});

describe("resolveFromProjectRoot", () => {
  it("resolves core from the playground project tree", () => {
    const entry = resolveFromProjectRoot(playgroundRoot, "@agent-dev-lab/core/project");
    expect(entry).toContain(`${path.sep}core${path.sep}`);
  });
});
