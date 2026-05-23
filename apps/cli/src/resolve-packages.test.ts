import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

import { findMonorepoRoot, resolveWorkspacePackageRoot } from "../src/resolve-packages";

const cliSrcDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));

describe("resolveWorkspacePackageRoot", () => {
  it("finds monorepo root from the CLI package", () => {
    const root = findMonorepoRoot(cliSrcDir);
    expect(root).toBe(path.resolve(cliSrcDir, "..", ".."));
  });

  it("resolves web and playground from monorepo layout", () => {
    const web = resolveWorkspacePackageRoot("@agent-dev-lab/web");
    const playground = resolveWorkspacePackageRoot("@agent-dev-lab/playground");
    expect(web).toEndWith(`${path.sep}apps${path.sep}web`);
    expect(playground).toEndWith(`${path.sep}apps${path.sep}playground`);
  });
});
