import base from "@agent-dev-lab/common/eslint";
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
