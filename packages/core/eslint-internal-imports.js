/** ESLint flat-config block: restrict workflow runtime imports outside core implementation modules. */
export default {
  files: ["packages/core/src/**/*.{ts,tsx}"],
  ignores: [
    "packages/core/src/workflow/**",
    "packages/core/src/agent/**",
    "packages/core/src/tools/**",
    "packages/core/src/runtime/**",
    "packages/core/src/**/*.test.ts",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "**/workflow-run-event-channel",
              "**/active-workflow-context",
              "**/workflow-impl",
            ],
            message: "Workflow runtime internals are not importable from this module.",
          },
        ],
      },
    ],
  },
};
