import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function monorepoPlaygroundRoot(): string {
  const playgroundPkg = require.resolve("@agent-dev-lab/playground/package.json");
  return path.dirname(playgroundPkg);
}

export function webPackageRoot(): string {
  const webPkg = require.resolve("@agent-dev-lab/web/package.json");
  return path.dirname(webPkg);
}

export function webOutputRoot(): string {
  return path.join(webPackageRoot(), ".output");
}

export function cliPackageRoot(): string {
  return path.dirname(fileURLToPath(new URL("..", import.meta.url)));
}
