import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "bun:test";

import {
  applyE2eBump,
  applyTarballDependencies,
  attachLinkName,
  removeStaleVendorLockfile,
  staleVendorLockRefs,
  DEFAULT_E2E_LABEL,
  e2ePrereleaseVersion,
  ensureVendorSymlink,
  fileDependencySpec,
  listAttachedProjects,
  parseArgs,
  recordAttachedProject,
  relativeVendorTarget,
  resolveVendorTarget,
  stableTarballFileName,
  vendorFileSpecs,
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

describe("stableTarballFileName", () => {
  it("omits the version so attached file: specs stay stable", () => {
    expect(stableTarballFileName("@agent-dev-lab/core")).toBe("agent-dev-lab-core.tgz");
    expect(stableTarballFileName("@agent-dev-lab/cli")).toBe("agent-dev-lab-cli.tgz");
  });
});

describe("vendorFileSpecs", () => {
  it("points every pack target at vendor/<stable>.tgz", () => {
    expect(vendorFileSpecs()).toMatchObject({
      "@agent-dev-lab/core": "file:./vendor/agent-dev-lab-core.tgz",
      "@agent-dev-lab/tools": "file:./vendor/agent-dev-lab-tools.tgz",
    });
  });
});

describe("applyE2eBump", () => {
  it("bumps the version and leaves files untouched", () => {
    const bumped = applyE2eBump(
      { name: "@agent-dev-lab/tools", version: "0.0.0", files: ["dist", "src"] },
      { label: DEFAULT_E2E_LABEL },
    );
    expect(bumped.version).toBe("0.0.1-e2e.0");
    expect(bumped.files).toEqual(["dist", "src"]);
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

describe("attach registry and vendor symlink", () => {
  it("records a project symlink and lists it back", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-attach-"));
    const outDir = path.join(root, "out");
    const projectDir = path.join(root, "proj");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, "adl.config.ts"), "export default {};\n");

    recordAttachedProject(outDir, projectDir);
    expect(listAttachedProjects(outDir)).toEqual([realpathSync(projectDir)]);
    recordAttachedProject(outDir, projectDir);
    expect(listAttachedProjects(outDir)).toEqual([realpathSync(projectDir)]);
  });

  it("refuses two projects that share a basename", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-attach-"));
    const first = path.join(root, "a", "proj");
    const second = path.join(root, "b", "proj");
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    recordAttachedProject(path.join(root, "out"), first);
    expect(() => recordAttachedProject(path.join(root, "out"), second)).toThrow(/already points/);
  });

  it("throws when an attached symlink is dangling", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-attach-"));
    const attached = path.join(root, "out", "attached");
    mkdirSync(attached, { recursive: true });
    symlinkSync(path.join(root, "missing"), path.join(attached, "gone"));
    expect(() => listAttachedProjects(path.join(root, "out"))).toThrow(/is missing/);
  });

  it("creates a relative vendor symlink and is idempotent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-vendor-"));
    const projectDir = path.join(root, "proj");
    const tarballDir = path.join(root, "out", "tarballs");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(tarballDir, { recursive: true });

    expect(relativeVendorTarget(projectDir, tarballDir)).toBe(path.join("..", "out", "tarballs"));
    expect(attachLinkName(projectDir)).toBe("proj");

    ensureVendorSymlink(projectDir, tarballDir, { force: false });
    ensureVendorSymlink(projectDir, tarballDir, { force: false });
    expect(resolveVendorTarget(projectDir, path.join(projectDir, "vendor"))).toBe(
      path.resolve(tarballDir),
    );
  });

  it("detects bun.lock vendor tarball paths that no longer exist", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-lock-"));
    mkdirSync(path.join(root, "vendor"), { recursive: true });
    writeFileSync(path.join(root, "vendor", "agent-dev-lab-core.tgz"), "ok");
    const lock = `
      "@agent-dev-lab/core": "file:./vendor/agent-dev-lab-core-0.0.4-e2e.0.tgz",
      "@agent-dev-lab/cli": "file:./vendor/agent-dev-lab-cli.tgz",
    `;
    writeFileSync(path.join(root, "vendor", "agent-dev-lab-cli.tgz"), "ok");
    expect(staleVendorLockRefs(lock, root)).toEqual(["vendor/agent-dev-lab-core-0.0.4-e2e.0.tgz"]);
  });

  it("deletes bun.lock only when it names missing vendor tarballs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-lock-"));
    mkdirSync(path.join(root, "vendor"), { recursive: true });
    writeFileSync(path.join(root, "vendor", "agent-dev-lab-core.tgz"), "ok");
    writeFileSync(
      path.join(root, "bun.lock"),
      `"@agent-dev-lab/core": "file:./vendor/agent-dev-lab-core-0.0.4-e2e.0.tgz"\n`,
    );
    expect(removeStaleVendorLockfile(root)).toEqual(["vendor/agent-dev-lab-core-0.0.4-e2e.0.tgz"]);
    expect(existsSync(path.join(root, "bun.lock"))).toBe(false);

    writeFileSync(
      path.join(root, "bun.lock"),
      `"@agent-dev-lab/core": "file:./vendor/agent-dev-lab-core.tgz"\n`,
    );
    expect(removeStaleVendorLockfile(root)).toEqual([]);
    expect(existsSync(path.join(root, "bun.lock"))).toBe(true);
  });

  it("refuses to replace a real vendor directory without --force", () => {
    const root = mkdtempSync(path.join(tmpdir(), "adl-vendor-"));
    const projectDir = path.join(root, "proj");
    const tarballDir = path.join(root, "out", "tarballs");
    mkdirSync(path.join(projectDir, "vendor"), { recursive: true });
    mkdirSync(tarballDir, { recursive: true });
    writeFileSync(path.join(projectDir, "vendor", "old.tgz"), "stale");

    expect(() => ensureVendorSymlink(projectDir, tarballDir, { force: false })).toThrow(
      /not a symlink/,
    );
    ensureVendorSymlink(projectDir, tarballDir, { force: true });
    expect(resolveVendorTarget(projectDir, path.join(projectDir, "vendor"))).toBe(
      path.resolve(tarballDir),
    );
  });
});
