import base from "@agent-dev-lab/common/eslint";
import coreInternalImports from "./packages/core/eslint-internal-imports.js";
import globals from "globals";

export default [
  ...base,
  coreInternalImports,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
