/**
 * Arm the project file watch when the inspector process starts — not on the
 * first browser request. Must run in this Nitro isolate (the one that serves
 * `/api`); a Vite-parent watcher would reload a different process-host.
 */
import { definePlugin } from "nitro";

import { getLoadedAdlProject } from "../src/lib/adl-project.server";

export default definePlugin(() => {
  void getLoadedAdlProject().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[adl] failed to arm project watch: ${message}\n`);
    throw error instanceof Error ? error : new Error(message);
  });
});
