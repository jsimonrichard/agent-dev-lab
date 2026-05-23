import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultPlaygroundRoot = path.resolve(webRoot, "../playground");

if (!process.env.ADL_PROJECT_ROOT) {
  process.env.ADL_PROJECT_ROOT = defaultPlaygroundRoot;
}

const config = defineConfig({
  envPrefix: "ADL_",
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
