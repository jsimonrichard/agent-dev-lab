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
);
