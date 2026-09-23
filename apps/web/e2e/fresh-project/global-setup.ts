import { launchFreshProjectDashboard, writeFreshProjectState } from "./harness";

export default async function globalSetup(): Promise<void> {
  const state = await launchFreshProjectDashboard();
  writeFreshProjectState(state);
  process.env.ADL_FRESH_E2E_BASE_URL = state.baseURL;
}
