// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Agent Dev Lab",
      description: "Documentation for Agent Dev Lab.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jsimonrichard/agent-dev-lab",
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../../packages/core/src/index.ts"],
          tsconfig: "../../packages/core/tsconfig.build.json",
          sidebar: { label: "Core API", collapsed: false },
        }),
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Overview", slug: "guides/overview" },
            { label: "Project setup", slug: "guides/project-setup" },
            { label: "Inspection UI", slug: "guides/inspection-ui" },
          ],
        },
        {
          label: "Core",
          items: [{ autogenerate: { directory: "core" } }],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
