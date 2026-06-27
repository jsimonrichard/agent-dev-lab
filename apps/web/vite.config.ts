import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// Load playground `.env` / `.env.local` and normalize injected secret names before SSR loads agents.
import "../playground/src/env.ts";

const ADL_FRAMEWORK_DEV_ENV = "ADL_FRAMEWORK_DEV";
const ADL_PROJECT_ROOT_ENV = "ADL_PROJECT_ROOT";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const frameworkPlaygroundRoot = path.resolve(webRoot, "../playground");

if (!process.env[ADL_PROJECT_ROOT_ENV]) {
  process.env[ADL_PROJECT_ROOT_ENV] = frameworkPlaygroundRoot;
  process.env[ADL_FRAMEWORK_DEV_ENV] = "1";
}

const config = defineConfig({
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
    nitro({
      rollupConfig: {
        external: [/^@agent-dev-lab\/core(\/.*)?$/],
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
