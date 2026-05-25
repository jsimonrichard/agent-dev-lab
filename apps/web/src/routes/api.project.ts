import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

import { getLoadedAdlProject } from "#/lib/adl-project";
import { getProjectInspectorMeta } from "#/lib/run-service";

export const Route = createFileRoute("/api/project")({
  server: {
    handlers: {
      GET: async () => {
        const project = await getLoadedAdlProject();
        const meta = await getProjectInspectorMeta();
        return json({
          root: project.root,
          configPath: project.configPath,
          config: {
            name: project.config.name,
            workflowIds: meta.workflowIds,
            agentIds: meta.agentIds,
          },
          meta,
        });
      },
    },
  },
});
