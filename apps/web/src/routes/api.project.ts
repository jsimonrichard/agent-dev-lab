import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { getLoadedAdlProject } from "#/lib/adl-project";

export const Route = createFileRoute("/api/project")({
  server: {
    handlers: {
      GET: async () => {
        const project = await getLoadedAdlProject();
        return json({
          root: project.root,
          configPath: project.configPath,
          config: project.config,
        });
      },
    },
  },
});
