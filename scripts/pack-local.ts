/**
 * Pack the publishable workspace packages (plus private `@agent-dev-lab/tools`)
 * as local prerelease tarballs, optionally scaffolding a consumer project
 * pointed at them.
 *
 * This is the nlttyxmo flow without leaving version bumps in the working copy:
 * `bun pm pack` rewrites `workspace:*` from `bun.lock` workspace versions, so
 * we bump + `scripts/patch-lock.ts` only for the duration of the pack, then
 * restore. Same pack recipe as `scripts/ci-publish.sh` (strip devDependencies,
 * then `bun pm pack`). Does not publish.
 *
 *   bun run pack:local
 *   bun run pack:local -- --project /tmp/adl-e2e
 *   bun run pack:local -- --from-published @agent-dev-lab/cli@0.0.5 --project /tmp/adl-upgrade
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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

const TOOLS_PACK_FILES = ["dist", "src"] as const;

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

/** npm-pack filename: `@scope/name` + version → `scope-name-version.tgz`. */
export function tarballFileName(packageName: string, version: string): string {
  const safeName = packageName.replace(/^@/, "").replaceAll("/", "-");
  return `${safeName}-${version}.tgz`;
}

export function applyE2eBump(
  pkg: PackageJson,
  options: { label: string; ensureFiles?: readonly string[] },
): PackageJson {
  if (typeof pkg.version !== "string") {
    throw new Error("package.json is missing a version");
  }
  const next: PackageJson = {
    ...pkg,
    version: e2ePrereleaseVersion(pkg.version, options.label),
  };
  if (options.ensureFiles && next.files === undefined) {
    next.files = [...options.ensureFiles];
  }
  return next;
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

Usage:
  bun run pack:local -- [options]

Options:
  --out DIR              Tarball directory (default: ${DEFAULT_OUT_DIR})
  --project DIR          Scaffold an ADL project and point it at the tarballs
  --from-published SPEC  Init the project with bunx SPEC (e.g. @agent-dev-lab/cli@0.0.5)
  --label LABEL          Prerelease label after the bumped patch (default: ${DEFAULT_E2E_LABEL})
  --skip-build           Do not run turbo build before packing
  --skip-install         With --project, write package.json but do not bun install
  --force                Overwrite existing tarballs / a non-empty project dir
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

function copyTarballsToVendor(
  projectDir: string,
  packed: ReadonlyArray<{ name: string; tarball: string }>,
): Record<string, string> {
  const vendor = path.join(projectDir, "vendor");
  mkdirSync(vendor, { recursive: true });
  const specs: Record<string, string> = {};
  for (const item of packed) {
    const dest = path.join(vendor, path.basename(item.tarball));
    if (path.resolve(item.tarball) !== path.resolve(dest)) {
      copyFileSync(item.tarball, dest);
    }
    specs[item.name] = fileDependencySpec(projectDir, dest);
  }
  return specs;
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
  const projectDir = args.project === undefined ? undefined : path.resolve(cwd, args.project);

  if (projectDir !== undefined && dirHasEntries(projectDir)) {
    const hasProject = existsSync(path.join(projectDir, "adl.config.ts"));
    if (!args.force) {
      throw new Error(
        `${projectDir} is not empty. Pass --force to reuse an existing ADL project, or choose another --project.`,
      );
    }
    if (!hasProject) {
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

  mkdirSync(outDir, { recursive: true });
  if (dirHasEntries(outDir) && !args.force) {
    throw new Error(`${outDir} is not empty. Pass --force to overwrite, or choose another --out.`);
  }
  if (args.force && existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (name.endsWith(".tgz")) {
        rmSync(path.join(outDir, name));
      }
    }
  }

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
      const bumped = applyE2eBump(pkg, {
        label: args.label,
        ensureFiles: target.name === "@agent-dev-lab/tools" ? TOOLS_PACK_FILES : undefined,
      });
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
      const dest = path.join(outDir, tarballFileName(target.name, pkg.version));
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

  if (projectDir === undefined) {
    process.stdout.write(
      `\nNext: bun run pack:local -- --project <dir> --force --skip-build --out ${outDir}\n`,
    );
    return;
  }

  if (!existsSync(path.join(projectDir, "adl.config.ts"))) {
    scaffoldProject(bunBin, monorepoRoot, projectDir, args.fromPublished);
  }

  const pkgPath = path.join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`init did not create ${pkgPath}`);
  }
  const specs = copyTarballsToVendor(projectDir, packed);
  const pkg = readPackageJson(pkgPath);
  const next = applyTarballDependencies(pkg, specs);
  writePackageJson(pkgPath, { ...pkg, ...next });
  process.stdout.write(`Pointed ${pkgPath} at vendor/ tarballs\n`);

  if (!args.skipInstall) {
    run([bunBin, "install"], { cwd: projectDir, inherit: true });
  }

  process.stdout.write(`\nProject: ${projectDir}\n`);
  process.stdout.write("Next: bunx adl dashboard --serve\n");
}

if (import.meta.main) {
  await packLocal(process.argv.slice(2), process.cwd()).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
