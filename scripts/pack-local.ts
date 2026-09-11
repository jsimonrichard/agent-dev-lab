/**
 * Pack the publishable workspace packages as local prerelease tarballs, and
 * attach consumer projects via a stable `vendor/` symlink.
 *
 * Tarball *contents* get a bumped `*-e2e` version so `bun pm pack` rewrites
 * `workspace:*` from `bun.lock`. Filenames are versionless
 * (`agent-dev-lab-core.tgz`) so attached projects keep the same `file:` specs
 * across reruns. `--project` records a symlink under `<out>/attached/`; later
 * `pack:local` overwrites the tarballs and refreshes every attached project
 * (no re-scaffold). Version bumps in this repo are restored on exit.
 *
 * Same pack recipe as `scripts/ci-publish.sh`. Does not publish.
 *
 *   bun run pack:local -- --project /tmp/adl-e2e
 *   bun run pack:local
 *   bun run pack:local -- --from-published @agent-dev-lab/cli@0.0.5 --project /tmp/adl-upgrade
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const PACK_TARGETS = [
  { name: "@agent-dev-lab/core", dir: "packages/core" },
  { name: "@agent-dev-lab/web", dir: "apps/web" },
  { name: "@agent-dev-lab/cli", dir: "apps/cli" },
  { name: "@agent-dev-lab/tools", dir: "packages/tools" },
] as const;

export const DEFAULT_E2E_LABEL = "e2e.0";
export const DEFAULT_OUT_DIR = path.join(".data", "packed-e2e");
export const TARBALLS_DIR_NAME = "tarballs";
export const ATTACHED_DIR_NAME = "attached";
export const VENDOR_DIR_NAME = "vendor";

export type PackageJson = {
  name?: string;
  version?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  devDependencies?: Record<string, unknown>;
};

export type PackLocalArgs = {
  out: string | undefined;
  project: string | undefined;
  fromPublished: string | undefined;
  label: string;
  skipBuild: boolean;
  skipInstall: boolean;
  force: boolean;
  help: boolean;
};

export function e2ePrereleaseVersion(version: string, label: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(`unparseable package version: ${JSON.stringify(version)}`);
  }
  if (!label) {
    throw new Error("prerelease label must be non-empty");
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return `${major}.${minor}.${patch + 1}-${label}`;
}

/** npm-safe filename stem: `@scope/name` → `scope-name`. */
export function tarballSafeName(packageName: string): string {
  return packageName.replace(/^@/, "").replaceAll("/", "-");
}

/** Stable pack filename so attached `file:` specs survive a rerun. */
export function stableTarballFileName(packageName: string): string {
  return `${tarballSafeName(packageName)}.tgz`;
}

export function vendorFileSpecs(): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const target of PACK_TARGETS) {
    specs[target.name] = `file:./${VENDOR_DIR_NAME}/${stableTarballFileName(target.name)}`;
  }
  return specs;
}

export function tarballsDir(outDir: string): string {
  return path.join(outDir, TARBALLS_DIR_NAME);
}

export function attachedDir(outDir: string): string {
  return path.join(outDir, ATTACHED_DIR_NAME);
}

export function attachLinkName(projectDir: string): string {
  const name = path.basename(path.resolve(projectDir));
  if (!name || name === "." || name === "/" || name === path.sep) {
    throw new Error(`could not derive an attach name from ${projectDir}`);
  }
  return name;
}

/** Symlink target for `project/vendor`, relative to the project root. */
export function relativeVendorTarget(projectDir: string, tarballDir: string): string {
  const rel = path.relative(path.resolve(projectDir), path.resolve(tarballDir));
  if (rel === "") {
    throw new Error(`refusing to point ${VENDOR_DIR_NAME}/ at the project root`);
  }
  return rel;
}

/** `vendor/*.tgz` paths mentioned in a bun.lock that are not on disk. */
export function staleVendorLockRefs(lockText: string, projectDir: string): string[] {
  const refs = new Set<string>();
  for (const match of lockText.matchAll(/vendor\/[A-Za-z0-9._+-]+\.tgz/g)) {
    const rel = match[0];
    if (!existsSync(path.join(projectDir, rel))) {
      refs.add(rel);
    }
  }
  return [...refs];
}

export function removeStaleVendorLockfile(projectDir: string): string[] {
  const lockPath = path.join(projectDir, "bun.lock");
  if (!existsSync(lockPath)) {
    return [];
  }
  const stale = staleVendorLockRefs(readFileSync(lockPath, "utf8"), projectDir);
  if (stale.length === 0) {
    return [];
  }
  rmSync(lockPath);
  return stale;
}

export function resolveVendorTarget(projectDir: string, vendorPath: string): string {
  const st = lstatSync(vendorPath);
  if (!st.isSymbolicLink()) {
    throw new Error(`${vendorPath} is not a symlink`);
  }
  return path.resolve(projectDir, readlinkSync(vendorPath));
}

export function applyE2eBump(pkg: PackageJson, options: { label: string }): PackageJson {
  if (typeof pkg.version !== "string") {
    throw new Error("package.json is missing a version");
  }
  return {
    ...pkg,
    version: e2ePrereleaseVersion(pkg.version, options.label),
  };
}

export function applyTarballDependencies(
  pkg: Pick<PackageJson, "dependencies" | "overrides">,
  tarballs: Readonly<Record<string, string>>,
): { dependencies: Record<string, string>; overrides: Record<string, string> } {
  const names = Object.keys(tarballs);
  if (names.length === 0) {
    throw new Error("applyTarballDependencies requires at least one tarball");
  }
  const dependencies = { ...pkg.dependencies };
  const overrides = { ...pkg.overrides };
  for (const name of names) {
    const spec = tarballs[name];
    if (!spec) {
      throw new Error(`tarball spec for ${name} is empty`);
    }
    dependencies[name] = spec;
    overrides[name] = spec;
  }
  return { dependencies, overrides };
}

export function fileDependencySpec(fromDir: string, tarballAbs: string): string {
  const rel = path.relative(fromDir, tarballAbs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return `file:${tarballAbs}`;
  }
  return `file:./${rel}`;
}

export function parseArgs(argv: string[]): PackLocalArgs {
  const args: PackLocalArgs = {
    out: undefined,
    project: undefined,
    fromPublished: undefined,
    label: DEFAULT_E2E_LABEL,
    skipBuild: false,
    skipInstall: false,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) {
      throw new Error("argv contained an empty slot");
    }
    switch (token) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--out":
        args.out = requireValue(argv, i, token);
        i += 1;
        break;
      case "--project":
        args.project = requireValue(argv, i, token);
        i += 1;
        break;
      case "--from-published":
        args.fromPublished = requireValue(argv, i, token);
        i += 1;
        break;
      case "--label":
        args.label = requireValue(argv, i, token);
        i += 1;
        break;
      case "--skip-build":
        args.skipBuild = true;
        break;
      case "--skip-install":
        args.skipInstall = true;
        break;
      case "--force":
        args.force = true;
        break;
      default:
        throw new Error(`unknown argument: ${token}`);
    }
  }

  if (args.fromPublished !== undefined && args.project === undefined) {
    throw new Error("--from-published requires --project");
  }

  return args;
}

function requireValue(argv: string[], flagIndex: number, flag: string): string {
  const value = argv[flagIndex + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export const HELP = `Pack @agent-dev-lab/{core,web,cli,tools} as local prerelease tarballs.

Tarballs use stable names under <out>/tarballs/. --project attaches a consumer
by making vendor/ a symlink there and recording <out>/attached/<name>. Later
runs overwrite the tarballs and refresh every attached project (bun install
unless --skip-install). No re-scaffold.

Usage:
  bun run pack:local -- [options]

Options:
  --out DIR              Pack directory (default: ${DEFAULT_OUT_DIR})
  --project DIR          Attach this ADL project (scaffold if it has no adl.config.ts)
  --from-published SPEC  Init a new project with bunx SPEC (e.g. @agent-dev-lab/cli@0.0.5)
  --label LABEL          Prerelease label after the bumped patch (default: ${DEFAULT_E2E_LABEL})
  --skip-build           Do not run turbo build before packing
  --skip-install         Refresh vendor/ + package.json but do not bun install
  --force                Replace a non-symlink vendor/ directory
  -h, --help             Show this help

Version bumps and bun.lock edits are restored before the script exits.
Does not publish.
`;

function findMonorepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  const fsRoot = path.parse(dir).root;
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
      if (pkg.workspaces) {
        return dir;
      }
    }
    if (dir === fsRoot) {
      throw new Error(`could not find the ADL monorepo root walking up from ${startDir}`);
    }
    dir = path.dirname(dir);
  }
}

function readPackageJson(filePath: string): PackageJson {
  return JSON.parse(readFileSync(filePath, "utf8")) as PackageJson;
}

function writePackageJson(filePath: string, pkg: PackageJson): void {
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function assertBun(): string {
  if (typeof Bun === "undefined") {
    throw new Error("scripts/pack-local.ts must be run with bun");
  }
  return process.execPath;
}

function run(
  argv: string[],
  options: { cwd: string; inherit?: boolean },
): { stdout: string; stderr: string } {
  const result = spawnSync(argv[0]!, argv.slice(1), {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    const detail = options.inherit
      ? `exit ${result.status ?? "null"}`
      : `${result.stdout}\n${result.stderr}`;
    throw new Error(`${argv.join(" ")} failed:\n${detail}`);
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function dirHasEntries(dir: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`${dir} exists and is not a directory`);
  }
  return readdirSync(dir).length > 0;
}

function backupFiles(paths: string[]): () => void {
  const snapshots = paths.map((filePath) => {
    if (!existsSync(filePath)) {
      throw new Error(`refusing to pack: missing ${filePath}`);
    }
    return { filePath, contents: readFileSync(filePath, "utf8") };
  });
  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const { filePath, contents } of snapshots) {
      writeFileSync(filePath, contents);
    }
  };
}

function packOne(bunBin: string, packageDir: string, destTarball: string): void {
  const pkgPath = path.join(packageDir, "package.json");
  const original = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(original) as PackageJson;
  const stripped = { ...pkg };
  delete stripped.devDependencies;
  writePackageJson(pkgPath, stripped);
  try {
    run([bunBin, "pm", "pack", "--filename", destTarball], { cwd: packageDir });
  } finally {
    writeFileSync(pkgPath, original);
  }
  if (!existsSync(destTarball)) {
    throw new Error(`bun pm pack did not write ${destTarball}`);
  }
}

export function listAttachedProjects(outDir: string): string[] {
  const dir = attachedDir(outDir);
  if (!existsSync(dir)) {
    return [];
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`${dir} exists and is not a directory`);
  }
  const names = readdirSync(dir);
  return names.map((name) => {
    const link = path.join(dir, name);
    const st = lstatSync(link);
    if (!st.isSymbolicLink()) {
      throw new Error(`${link} is not a symlink; attached/ must contain only project symlinks`);
    }
    const target = path.resolve(dir, readlinkSync(link));
    if (!existsSync(target)) {
      throw new Error(
        `attached project ${name} → ${target} is missing. Remove ${link} or restore the project.`,
      );
    }
    return realpathSync(target);
  });
}

export function recordAttachedProject(outDir: string, projectDir: string): void {
  const dir = attachedDir(outDir);
  mkdirSync(dir, { recursive: true });
  const name = attachLinkName(projectDir);
  const link = path.join(dir, name);
  const resolvedProject = realpathSync(projectDir);
  if (existsSync(link) || isSymlink(link)) {
    const current = path.resolve(dir, readlinkSync(link));
    const currentReal = existsSync(current) ? realpathSync(current) : current;
    if (currentReal !== resolvedProject) {
      throw new Error(
        `${link} already points at ${current}, not ${resolvedProject}. Use a distinct project directory name.`,
      );
    }
    return;
  }
  symlinkSync(resolvedProject, link);
}

export function ensureVendorSymlink(
  projectDir: string,
  tarballDir: string,
  options: { force: boolean },
): void {
  const vendor = path.join(projectDir, VENDOR_DIR_NAME);
  const desired = path.resolve(tarballDir);
  const rel = relativeVendorTarget(projectDir, tarballDir);

  if (isSymlink(vendor)) {
    const current = resolveVendorTarget(projectDir, vendor);
    if (current === desired) {
      return;
    }
    if (!options.force) {
      throw new Error(
        `${vendor} is a symlink to ${readlinkSync(vendor)}, expected ${rel}. Pass --force to replace it.`,
      );
    }
    rmSync(vendor);
  } else if (existsSync(vendor)) {
    if (!options.force) {
      throw new Error(
        `${vendor} exists and is not a symlink to ${desired}. Pass --force to replace it with a symlink.`,
      );
    }
    rmSync(vendor, { recursive: true, force: true });
  }

  symlinkSync(rel, vendor);
}

function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function refreshAttachedProject(
  projectDir: string,
  tarballDir: string,
  options: { force: boolean },
): void {
  const pkgPath = path.join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`attached project is missing ${pkgPath}`);
  }
  ensureVendorSymlink(projectDir, tarballDir, options);
  const pkg = readPackageJson(pkgPath);
  const next = applyTarballDependencies(pkg, vendorFileSpecs());
  writePackageJson(pkgPath, { ...pkg, ...next });
  const stale = removeStaleVendorLockfile(projectDir);
  if (stale.length > 0) {
    process.stdout.write(`Removed stale bun.lock in ${projectDir} (missing ${stale.join(", ")})\n`);
  }
}

function scaffoldProject(
  bunBin: string,
  monorepoRoot: string,
  projectDir: string,
  fromPublished: string | undefined,
): void {
  mkdirSync(projectDir, { recursive: true });
  if (fromPublished !== undefined) {
    run([bunBin, "x", "--yes", fromPublished, "init", projectDir], {
      cwd: monorepoRoot,
      inherit: true,
    });
    return;
  }
  const cliBin = path.join(monorepoRoot, "apps/cli/src/bin/cli.ts");
  if (!existsSync(cliBin)) {
    throw new Error(`CLI entrypoint missing: ${cliBin}`);
  }
  run([bunBin, cliBin, "init", projectDir], { cwd: monorepoRoot, inherit: true });
}

export async function packLocal(argv: string[], cwd: string): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const bunBin = assertBun();
  const monorepoRoot = findMonorepoRoot(cwd);
  const outDir = path.resolve(cwd, args.out ?? path.join(monorepoRoot, DEFAULT_OUT_DIR));
  const tarballDir = tarballsDir(outDir);
  const projectDir = args.project === undefined ? undefined : path.resolve(cwd, args.project);

  if (projectDir !== undefined && dirHasEntries(projectDir)) {
    if (!existsSync(path.join(projectDir, "adl.config.ts"))) {
      throw new Error(
        `${projectDir} is not empty and is not an ADL project; refusing to clobber it`,
      );
    }
  }

  if (!args.skipBuild) {
    const turbo = path.join(monorepoRoot, "node_modules", ".bin", "turbo");
    if (!existsSync(turbo)) {
      throw new Error(`turbo is not installed at ${turbo}; run bun install`);
    }
    run([turbo, "run", "build", ...PACK_TARGETS.map((target) => `--filter=${target.name}`)], {
      cwd: monorepoRoot,
      inherit: true,
    });
  }

  mkdirSync(tarballDir, { recursive: true });

  const mutated = [
    path.join(monorepoRoot, "bun.lock"),
    ...PACK_TARGETS.map((target) => path.join(monorepoRoot, target.dir, "package.json")),
  ];
  const restore = backupFiles(mutated);
  const packed: Array<{ name: string; version: string; tarball: string }> = [];

  try {
    for (const target of PACK_TARGETS) {
      const pkgPath = path.join(monorepoRoot, target.dir, "package.json");
      const pkg = readPackageJson(pkgPath);
      const bumped = applyE2eBump(pkg, { label: args.label });
      if (typeof bumped.version !== "string") {
        throw new Error(`${pkgPath} lost its version after the e2e bump`);
      }
      writePackageJson(pkgPath, bumped);
    }

    run([bunBin, "run", "scripts/patch-lock.ts"], { cwd: monorepoRoot, inherit: true });

    for (const target of PACK_TARGETS) {
      const pkg = readPackageJson(path.join(monorepoRoot, target.dir, "package.json"));
      if (typeof pkg.version !== "string") {
        throw new Error(`${target.name} is missing a version after the e2e bump`);
      }
      const dest = path.join(tarballDir, stableTarballFileName(target.name));
      if (existsSync(dest)) {
        rmSync(dest);
      }
      packOne(bunBin, path.join(monorepoRoot, target.dir), dest);
      packed.push({ name: target.name, version: pkg.version, tarball: dest });
    }
  } finally {
    restore();
  }

  process.stdout.write("Packed:\n");
  for (const item of packed) {
    process.stdout.write(`  ${item.name}@${item.version} → ${item.tarball}\n`);
  }

  if (projectDir !== undefined) {
    if (!existsSync(path.join(projectDir, "adl.config.ts"))) {
      scaffoldProject(bunBin, monorepoRoot, projectDir, args.fromPublished);
    }
    recordAttachedProject(outDir, projectDir);
    process.stdout.write(`Attached ${projectDir} → ${attachedDir(outDir)}\n`);
  }

  const attached = listAttachedProjects(outDir);
  if (attached.length === 0) {
    process.stdout.write(`\nNo attached projects. bun run pack:local -- --project <dir>\n`);
    return;
  }

  for (const attachedProject of attached) {
    refreshAttachedProject(attachedProject, tarballDir, { force: args.force });
    process.stdout.write(`Refreshed vendor/ in ${attachedProject}\n`);
    if (!args.skipInstall) {
      run([bunBin, "install"], { cwd: attachedProject, inherit: true });
    }
  }

  process.stdout.write(`\nAttached: ${attached.join(", ")}\n`);
  process.stdout.write("Next: bunx adl dashboard --serve\n");
}

if (import.meta.main) {
  await packLocal(process.argv.slice(2), process.cwd()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
