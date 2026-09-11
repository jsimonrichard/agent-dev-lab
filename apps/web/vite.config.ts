import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv, type Plugin } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

import { createAdlViteLogger } from "./src/lib/adl-vite-logger";

const ADL_FRAMEWORK_DEV_ENV = "ADL_FRAMEWORK_DEV";
const ADL_PROJECT_ROOT_ENV = "ADL_PROJECT_ROOT";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const frameworkPlaygroundRoot = path.resolve(webRoot, "../playground");

/**
 * Vite's config isolate is not the isolate that serves `/api`. Hit that
 * worker after listen so `getLoadedAdlProject` arms the watch without a browser.
 */
function adlArmProjectWatchPlugin(): Plugin {
  return {
    name: "adl-arm-project-watch",
    configureServer(server) {
      const httpServer = server.httpServer;
      if (!httpServer) {
        throw new Error("adl-arm-project-watch: Vite httpServer is missing");
      }
      httpServer.once("listening", () => {
        const addr = httpServer.address();
        if (!addr || typeof addr === "string") {
          throw new Error("adl-arm-project-watch: expected a TCP listen address");
        }
        const url = `http://127.0.0.1:${addr.port}/api/project`;
        void (async () => {
          let lastError: unknown;
          for (let attempt = 0; attempt < 50; attempt += 1) {
            try {
              const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
              if (response.ok) {
                return;
              }
              lastError = new Error(`GET ${url} returned ${response.status}`);
            } catch (error) {
              lastError = error;
            }
            await new Promise((resolve) => {
              setTimeout(resolve, 50);
            });
          }
          const message = lastError instanceof Error ? lastError.message : String(lastError);
          process.stderr.write(`[adl] failed to arm project watch: ${message}\n`);
          throw lastError instanceof Error ? lastError : new Error(message);
        })();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  if (!process.env[ADL_PROJECT_ROOT_ENV]) {
    process.env[ADL_PROJECT_ROOT_ENV] = frameworkPlaygroundRoot;
    process.env[ADL_FRAMEWORK_DEV_ENV] = "1";
  }

  const projectRoot = process.env[ADL_PROJECT_ROOT_ENV]!;
  // Vite only copies ADL_* into import.meta.env; apply all project .env keys to
  // process.env so provider secrets (OPENAI_API_KEY) are visible to adl.ts.
  const fileEnv = loadEnv(mode, projectRoot, "");
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    customLogger: createAdlViteLogger(),
    envDir: projectRoot,
    envPrefix: "ADL_",
    ...(process.env.ADL_VITE_DISABLE_OPTIMIZE === "1"
      ? { optimizeDeps: { noDiscovery: true, include: [] } }
      : {}),
    resolve: {
      tsconfigPaths: true,
      alias: {
        "@": path.resolve(webRoot, "./src"),
      },
      conditions: ["development", "bun", "module", "import", "default"],
    },
    ssr: {
      // Keep core external so process-host / jiti state is one Node native module.
      // `development` export condition resolves workspace packages to `src/`.
      external: ["@agent-dev-lab/core", "@agent-dev-lab/core/project", "jiti"],
      resolve: {
        externalConditions: ["development", "bun", "node", "module-sync"],
      },
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart({
        srcDirectory: "src",
        importProtection: {
          client: {
            specifiers: ["@agent-dev-lab/core", "@agent-dev-lab/core/project"],
          },
        },
      }),
      viteReact(),
      adlArmProjectWatchPlugin(),
      nitro({
        plugins: ["./plugins/adl-project-watch.ts", "./plugins/adl-shutdown.ts"],
        rolldownConfig: {
          external: [/^@agent-dev-lab\/core(\/.*)?$/, "jiti"],
        },
      }),
    ],
  };
});
