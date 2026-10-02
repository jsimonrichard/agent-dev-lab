#!/usr/bin/env bun
/**
 * Fail closed before an RC publish: every publishable package version must
 * be a semver prerelease so we never tag a stable release as `rc` by mistake.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { isSemverPrerelease } from "./npm-dist-tag.ts";

const PUBLISHABLE = ["packages/core", "packages/tools", "apps/cli", "apps/web"] as const;

const root = path.resolve(import.meta.dir, "..");
const failures: string[] = [];

for (const rel of PUBLISHABLE) {
  const pkgPath = path.join(root, rel, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    name: string;
    version: string;
  };
  if (!isSemverPrerelease(pkg.version)) {
    failures.push(`${pkg.name}@${pkg.version} (${rel})`);
  }
}

if (failures.length > 0) {
  console.error(
    "Publish RC requires prerelease versions on all publishable packages.\n" +
      "Run `bunx changeset pre enter rc`, ensure changesets exist, then `bun run version`.\n" +
      "Non-prerelease:\n" +
      failures.map((line) => `  - ${line}`).join("\n"),
  );
  process.exit(1);
}

console.log("All publishable packages are prereleases.");
