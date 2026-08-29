import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { reloadAdlProjectForViteWatcher } from "#/lib/adl-project.server";

/**
 * Dev-only: Vite's adl-project-reload plugin `dispatchFetch`es here so reload
 * runs inside Nitro's worker (FetchableDevEnvironment), not the Vite config
 * isolate that only sees a forked process-host.
 */
export const Route = createFileRoute("/api/project/reload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.ADL_INSPECTOR_SERVE === "1") {
          return json({ error: "project reload is disabled in serve mode" }, { status: 404 });
        }
        const body = (await request.json().catch(() => ({}))) as { path?: string };
        const result = await reloadAdlProjectForViteWatcher(
          typeof body.path === "string" ? body.path : undefined,
        );
        return json(result);
      },
    },
  },
});
