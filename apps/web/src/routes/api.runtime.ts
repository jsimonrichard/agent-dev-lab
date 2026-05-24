import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { createCoreShell } from "@agent-dev-lab/core";

export const Route = createFileRoute("/api/runtime")({
  server: {
    handlers: {
      GET: () => json(createCoreShell()),
    },
  },
});
