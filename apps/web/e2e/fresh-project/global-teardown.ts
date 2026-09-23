import {
  clearFreshProjectState,
  readFreshProjectState,
  stopFreshProjectDashboard,
} from "./harness";

export default async function globalTeardown(): Promise<void> {
  try {
    const state = readFreshProjectState();
    await stopFreshProjectDashboard(state);
  } finally {
    clearFreshProjectState();
  }
}
