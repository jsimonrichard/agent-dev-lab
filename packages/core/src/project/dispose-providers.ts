import type { AdlProjectConfig } from "./config";
import { disposeToolProviders } from "../tools/provider";

/**
 * Calls {@link ToolProvider.dispose} on every distinct provider hanging off
 * `config.agents[].tools`. Plain {@link ToolSet}s and providers without `dispose`
 * are skipped. Shared objects are disposed once (identity set).
 *
 * Does not walk `AdlRuntimeConfig.tools` (a plain ToolSet) or per-call `input.tools`.
 */
export async function disposeRegistryProviders(config: AdlProjectConfig): Promise<void> {
  await disposeToolProviders((config.agents ?? []).map((agent) => agent.tools));
}
