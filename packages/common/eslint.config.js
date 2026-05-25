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
    ],
  },
  {
    files: [
      "apps/**/*.{ts,tsx}",
      "packages/common/**/*.{ts,tsx}",
      "packages/*/src/**/*.{ts,tsx}",
    ],
    ignores: ["packages/core/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@agent-dev-lab/core/(?!project(?:/|$)).+",
              message:
                "Import from @agent-dev-lab/core or @agent-dev-lab/core/project only (no deep package paths).",
            },
          ],
        },
      ],
    },
  },
);
