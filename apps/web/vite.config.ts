import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const ADL_FRAMEWORK_DEV_ENV = "ADL_FRAMEWORK_DEV";
const ADL_PROJECT_ROOT_ENV = "ADL_PROJECT_ROOT";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const frameworkPlaygroundRoot = path.resolve(webRoot, "../playground");

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
    envDir: projectRoot,
    envPrefix: "ADL_",
    resolve: {
      tsconfigPaths: true,
      alias: {
        "@": path.resolve(webRoot, "./src"),
      },
    },
    ssr: {
      external: ["@agent-dev-lab/core", "@agent-dev-lab/core/project", "jiti"],
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
      nitro({
        rollupConfig: {
          external: [/^@agent-dev-lab\/core(\/.*)?$/],
        },
      }),
    ],
  };
});
