import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAdlProject } from "@agent-dev-lab/runtime";

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = await loadAdlProject({ root: playgroundRoot });

console.log(`[playground] ADL project "${project.config.name}" at ${project.root}`);
