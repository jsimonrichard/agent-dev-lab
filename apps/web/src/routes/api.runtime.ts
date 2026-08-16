import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { getCoreShell } from "#/lib/runtime-info.server";

export const Route = createFileRoute("/api/runtime")({
  server: {
    handlers: {
      GET: () => json(getCoreShell()),
    },
  },
});
