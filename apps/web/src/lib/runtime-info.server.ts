import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { createCoreShell } from "@agent-dev-lab/core";

const require = createRequire(import.meta.url);

function corePackageVersion(): string {
  const coreEntry = require.resolve("@agent-dev-lab/core");
  const pkgPath = path.join(path.dirname(coreEntry), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export function getCoreShell() {
  return {
    ...createCoreShell(),
    version: corePackageVersion(),
  };
}
