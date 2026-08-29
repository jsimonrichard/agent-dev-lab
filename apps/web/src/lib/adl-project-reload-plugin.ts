import path from "node:path";

import { type Plugin, type ViteDevServer } from "vite";

import { shouldReloadAdlProjectPath } from "@agent-dev-lab/core/project";

const DEBOUNCE_MS = 150;

type DispatchFetchEnv = {
  dispatchFetch: (request: Request) => Promise<Response>;
};

function getDispatchFetch(server: ViteDevServer): ((request: Request) => Promise<Response>) | null {
  const nitro = server.environments.nitro ?? server.environments.ssr;
  const candidate = nitro as unknown as { dispatchFetch?: DispatchFetchEnv["dispatchFetch"] };
  if (typeof candidate.dispatchFetch === "function") {
    return candidate.dispatchFetch.bind(nitro);
  }
  return null;
}

/**
 * Drive ADL registry reload from Vite's chokidar watcher via Nitro
 * `dispatchFetch` into `/api/project/reload`.
 *
 * TanStack Start's nitro/ssr envs are fetchable worker runners. Reloading from
 * the Vite config isolate only updates a forked process-host; runs still use
 * the worker registry.
 */
export function adlProjectReloadPlugin(projectRoot: string): Plugin {
  const root = path.resolve(projectRoot);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingPath: string | undefined;
  let server: ViteDevServer | undefined;

  const schedule = (file: string) => {
    if (!shouldReloadAdlProjectPath(file, root)) {
      return;
    }
    pendingPath = file;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const trigger = pendingPath;
      pendingPath = undefined;
      void (async () => {
        if (!server) {
          return;
        }
        const dispatch = getDispatchFetch(server);
        if (!dispatch) {
          server.config.logger.error(
            `[adl] reload skipped: nitro/ssr has no dispatchFetch (envs=${Object.keys(server.environments).join(",")})`,
            { timestamp: true },
          );
          return;
        }
        try {
          server.config.logger.info("[adl] reloading project…", { timestamp: true });
          const response = await dispatch(
            new Request("http://adl.local/api/project/reload", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ path: trigger }),
            }),
          );
          const result = (await response.json()) as {
            lastReloadError?: string | null;
            error?: string;
          };
          if (!response.ok) {
            server.config.logger.error(
              `[adl] reload failed (${response.status}): ${result.error ?? response.statusText}`,
              { timestamp: true },
            );
            return;
          }
          if (result.lastReloadError) {
            server.config.logger.error(`[adl] reload error: ${result.lastReloadError}`, {
              timestamp: true,
            });
            return;
          }
          server.config.logger.info("[adl] reloaded", { timestamp: true });
        } catch (error) {
          server.config.logger.error(
            `[adl] reload failed: ${error instanceof Error ? error.message : String(error)}`,
            { timestamp: true },
          );
        }
      })();
    }, DEBOUNCE_MS);
  };

  return {
    name: "adl-project-reload",
    apply: "serve",
    configureServer(devServer) {
      server = devServer;
      process.env.ADL_VITE_PROJECT_WATCH = "1";
      process.env.ADL_PROJECT_WATCH = "1";
      devServer.watcher.add(root);
      devServer.watcher.on("change", schedule);
      devServer.watcher.on("add", schedule);
    },
  };
}
