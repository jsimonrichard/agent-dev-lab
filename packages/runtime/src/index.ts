/**
 * Headless workflow runtime (scaffold). Execution APIs and conversation trees are deferred;
 * this module only establishes package boundaries and safe imports for scripts/tests.
 */
export { loadPromptFile, resolvePromptPath } from "./prompt/load.js";
export { renderPromptTemplate } from "./prompt/render.js";
export {
  ADL_CONFIG_FILENAMES,
  ADL_PROJECT_ROOT_ENV,
  findAdlConfigPath,
  loadAdlProject,
  resolveProjectRoot,
  type AdlConfigFilename,
  type AdlProjectConfig,
  type LoadedAdlProject,
} from "./project/index.js";
export { generateText, streamText } from "ai";
export type { CoreMessage, LanguageModel } from "ai";

export function createRuntimeShell() {
  return {
    name: "agent-development-lab/runtime",
    capabilities: [
      "headless execution surface (workflows TBD)",
      "nested conversations preserved by design (storage TBD)",
    ],
  };
}
