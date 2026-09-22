/**
 * `ai/test` pulls in `@ai-sdk/provider-utils/test`, which imports `vitest` so
 * `createTestServer` can register hooks. Under `bun test`, re-evaluating that
 * module (fresh graph per file while `globalThis` still holds a prior
 * `GLOBAL_EXPECT`) spreads a `testPath` getter that calls `getWorkerState()`.
 * Without a worker, Vitest throws and the file is reported as an unhandled
 * error. Seed a minimal worker so createExpect can finish; we never run Vitest.
 */
(globalThis as { __vitest_worker__?: object }).__vitest_worker__ ??= {
  filepath: "",
  config: {},
  environment: {},
  moduleCache: new Map(),
  providedContext: {},
};
