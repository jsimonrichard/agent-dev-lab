import base from "./packages/common/eslint.config.js";
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
