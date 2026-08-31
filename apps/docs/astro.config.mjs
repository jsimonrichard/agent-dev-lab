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
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Agent Dev Lab",
      },
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
            { label: "Project Setup", slug: "guides/project-setup" },
            { label: "Manual Setup", slug: "guides/manual-setup" },
            { label: "Inspection UI", slug: "guides/inspection-ui" },
            { label: "Gotchas", slug: "guides/gotchas" },
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
