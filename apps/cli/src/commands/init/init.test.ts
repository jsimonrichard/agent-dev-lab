import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import init from "./impl";
import { PLAYGROUND_SOURCE_FILES } from "./scaffold-files";
import { buildInitGitignore, rewritePlaygroundConfigName } from "./scaffold";
import { buildContext } from "../../context";
import { playgroundPackageRoot } from "../../paths";

describe("adl init", () => {
  it("scaffolds a project directory from the playground", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "adl-init-"));
    const ctx = buildContext(process);
    await init.call(ctx, {}, dir);

    const name = path.basename(dir);
    const playground = playgroundPackageRoot();

    for (const relative of PLAYGROUND_SOURCE_FILES) {
      const actual = await readFile(path.join(dir, relative), "utf8");
      const expected = await readFile(path.join(playground, relative), "utf8");
      if (relative === "adl.config.ts") {
        expect(actual).toBe(rewritePlaygroundConfigName(expected, name));
      } else {
        expect(actual).toBe(expected);
      }
    }

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      imports?: Record<string, string>;
    };
    expect(pkg.dependencies["@agent-dev-lab/core"]).toBe("^0.1.0");
    expect(pkg.dependencies["@agent-dev-lab/cli"]).toBe("^0.1.0");
    expect(pkg.imports?.["#adl"]).toBe("./src/adl.ts");
    expect(await readFile(path.join(dir, ".gitignore"), "utf8")).toContain("node_modules/");
  });
});

describe("init scaffold helpers", () => {
  it("substitutes the playground project name", () => {
    expect(
      rewritePlaygroundConfigName(`export default {\n  name: "playground",\n};\n`, "demo"),
    ).toBe(`export default {\n  name: "demo",\n};\n`);
  });

  it("adds node_modules to the playground gitignore", () => {
    expect(buildInitGitignore(".adl/\n.data/\n")).toBe("node_modules/\n.adl/\n.data/\n");
  });
});
