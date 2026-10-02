import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Shared ESLint flat config for the monorepo. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.astro/**",
      "**/routeTree.gen.ts",
      "**/.output/**",
      "apps/cli/scaffold/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/blob-report/**",
    ],
  },
  // Layer smoke (wave 0 governance). Patterns assume eslint cwd is the monorepo root
  // (`bun run lint` / gate). core stays headless; tools must not reach hosts.
  {
    files: ["packages/core/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@agent-dev-lab/web",
              message: "packages/core must not import hosts or tools packages.",
            },
            {
              name: "@agent-dev-lab/cli",
              message: "packages/core must not import hosts or tools packages.",
            },
            {
              name: "@agent-dev-lab/tools",
              message: "packages/core must not import hosts or tools packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/tools/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@agent-dev-lab/web",
              message: "packages/tools must not import host packages.",
            },
            {
              name: "@agent-dev-lab/cli",
              message: "packages/tools must not import host packages.",
            },
          ],
        },
      ],
    },
  },
);
