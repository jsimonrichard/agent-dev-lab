/**
 * Runs during Nitro startup (before srvx `listen`) so we can track the HTTP
 * server and coordinate graceful drain / force-cancel of active runs.
 */
import { definePlugin } from "nitro";

import { armServerShutdown, installHttpServerTracking } from "../src/lib/server-shutdown.server";

export default definePlugin(() => {
  installHttpServerTracking();
  armServerShutdown();
});
