import { describe, expect, it } from "bun:test";

import {
  applyE2eBump,
  applyTarballDependencies,
  DEFAULT_E2E_LABEL,
  e2ePrereleaseVersion,
  fileDependencySpec,
  parseArgs,
  tarballFileName,
} from "./pack-local.ts";

describe("e2ePrereleaseVersion", () => {
  it("increments the patch and appends the label", () => {
    expect(e2ePrereleaseVersion("0.0.3", "e2e.0")).toBe("0.0.4-e2e.0");
    expect(e2ePrereleaseVersion("0.0.0", "e2e.0")).toBe("0.0.1-e2e.0");
    expect(e2ePrereleaseVersion("0.0.5", "e2e.1")).toBe("0.0.6-e2e.1");
  });

  it("strips an existing prerelease or build suffix before incrementing", () => {
    expect(e2ePrereleaseVersion("0.0.4-e2e.0", "e2e.0")).toBe("0.0.5-e2e.0");
    expect(e2ePrereleaseVersion("1.2.3+build.9", "e2e.0")).toBe("1.2.4-e2e.0");
  });

  it("throws on an unparseable version or empty label", () => {
    expect(() => e2ePrereleaseVersion("next", "e2e.0")).toThrow(/unparseable/);
    expect(() => e2ePrereleaseVersion("0.0.3", "")).toThrow(/non-empty/);
  });
});

describe("tarballFileName", () => {
  it("matches bun/npm pack naming for scoped packages", () => {
    expect(tarballFileName("@agent-dev-lab/core", "0.0.4-e2e.0")).toBe(
      "agent-dev-lab-core-0.0.4-e2e.0.tgz",
    );
    expect(tarballFileName("@agent-dev-lab/cli", "0.0.6-e2e.0")).toBe(
      "agent-dev-lab-cli-0.0.6-e2e.0.tgz",
    );
  });
});

describe("applyE2eBump", () => {
  it("bumps the version and adds a files list only when missing", () => {
    const bumped = applyE2eBump(
      { name: "@agent-dev-lab/tools", version: "0.0.0" },
      { label: DEFAULT_E2E_LABEL, ensureFiles: ["dist", "src"] },
    );
    expect(bumped.version).toBe("0.0.1-e2e.0");
    expect(bumped.files).toEqual(["dist", "src"]);

    const alreadyListed = applyE2eBump(
      { version: "0.0.3", files: ["dist"] },
      { label: DEFAULT_E2E_LABEL, ensureFiles: ["dist", "src"] },
    );
    expect(alreadyListed.files).toEqual(["dist"]);
  });

  it("throws when version is missing", () => {
    expect(() => applyE2eBump({}, { label: DEFAULT_E2E_LABEL })).toThrow(/missing a version/);
  });
});

describe("applyTarballDependencies", () => {
  it("writes every tarball into dependencies and overrides", () => {
    const next = applyTarballDependencies(
      { dependencies: { "@agent-dev-lab/core": "^0.0.3", zod: "^4.1.8" } },
      {
        "@agent-dev-lab/core": "file:./vendor/core.tgz",
        "@agent-dev-lab/tools": "file:./vendor/tools.tgz",
      },
    );
    expect(next.dependencies).toEqual({
      "@agent-dev-lab/core": "file:./vendor/core.tgz",
      "@agent-dev-lab/tools": "file:./vendor/tools.tgz",
      zod: "^4.1.8",
    });
    expect(next.overrides).toEqual({
      "@agent-dev-lab/core": "file:./vendor/core.tgz",
      "@agent-dev-lab/tools": "file:./vendor/tools.tgz",
    });
  });

  it("throws when given no tarballs", () => {
    expect(() => applyTarballDependencies({ dependencies: {} }, {})).toThrow(/at least one/);
  });
});

describe("fileDependencySpec", () => {
  it("uses a relative file: spec when the tarball is inside the project", () => {
    expect(fileDependencySpec("/tmp/proj", "/tmp/proj/vendor/core.tgz")).toBe(
      "file:./vendor/core.tgz",
    );
  });

  it("uses an absolute file: spec when the tarball is outside the project", () => {
    expect(fileDependencySpec("/tmp/proj", "/var/packs/core.tgz")).toBe("file:/var/packs/core.tgz");
  });
});

describe("parseArgs", () => {
  it("applies documented defaults", () => {
    expect(parseArgs([])).toEqual({
      out: undefined,
      project: undefined,
      fromPublished: undefined,
      label: DEFAULT_E2E_LABEL,
      skipBuild: false,
      skipInstall: false,
      force: false,
      help: false,
    });
  });

  it("parses the nlttyxmo-style project invocation", () => {
    expect(
      parseArgs([
        "--project",
        "/tmp/adl-e2e",
        "--from-published",
        "@agent-dev-lab/cli@0.0.5",
        "--force",
      ]),
    ).toMatchObject({
      project: "/tmp/adl-e2e",
      fromPublished: "@agent-dev-lab/cli@0.0.5",
      force: true,
    });
  });

  it("rejects --from-published without --project and unknown flags", () => {
    expect(() => parseArgs(["--from-published", "@agent-dev-lab/cli@0.0.5"])).toThrow(
      /requires --project/,
    );
    expect(() => parseArgs(["--unknown"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--out"])).toThrow(/requires a value/);
  });
});
