import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";

import { webOutputRoot, webPackageRoot } from "../src/paths.ts";

interface NitroManifest {
  serverEntry?: string;
  publicDir?: string;
}

function fail(message: string): never {
  console.error(`@agent-dev-lab/cli: ${message}`);
  console.error("Build the inspection UI first: bun run build --filter=@agent-dev-lab/web");
  process.exit(1);
}

function assertExists(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    fail(`Expected ${label} at ${filePath}`);
  }
}

function assertFile(filePath: string, label: string): void {
  assertExists(filePath, label);
  if (!statSync(filePath).isFile()) {
    fail(`Expected ${label} to be a file at ${filePath}`);
  }
}

function assertDirectory(dirPath: string, label: string): void {
  assertExists(dirPath, label);
  if (!statSync(dirPath).isDirectory()) {
    fail(`Expected ${label} to be a directory at ${dirPath}`);
  }
}

const outputRoot = webOutputRoot();
const nitroManifestPath = `${outputRoot}/nitro.json`;

let serverEntry = `${outputRoot}/server/index.mjs`;
let publicDir = `${outputRoot}/public`;

if (existsSync(nitroManifestPath)) {
  const manifest = JSON.parse(readFileSync(nitroManifestPath, "utf8")) as NitroManifest;
  serverEntry = `${outputRoot}/${manifest.serverEntry ?? "server/index.mjs"}`;
  publicDir = `${outputRoot}/${manifest.publicDir ?? "public"}`;
} else if (!existsSync(serverEntry)) {
  fail(
    `Missing inspection UI build output under ${outputRoot} (no nitro.json or server/index.mjs)`,
  );
}

assertFile(serverEntry, "Nitro server entry");
assertDirectory(publicDir, "Nitro public assets directory");

console.log(`@agent-dev-lab/cli: verified inspection UI build at ${webPackageRoot()}/.output`);
