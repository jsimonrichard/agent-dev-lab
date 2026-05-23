import path from "node:path";

import { resolveWorkspacePackageRoot } from "./resolve-packages";

export function monorepoPlaygroundRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/playground");
}

export function webPackageRoot(): string {
  return resolveWorkspacePackageRoot("@agent-dev-lab/web");
}

export function webOutputRoot(): string {
  return path.join(webPackageRoot(), ".output");
}
