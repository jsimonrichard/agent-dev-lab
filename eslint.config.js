import base from "@agent-dev-lab/core/eslint";
import globals from "globals";

export default [
  ...base,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
