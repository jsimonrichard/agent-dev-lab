// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, {
  createStarlightTypeDocPlugin,
  typeDocSidebarGroup,
} from "starlight-typedoc";

const [toolsTypeDoc, toolsTypeDocSidebarGroup] = createStarlightTypeDocPlugin();

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
        toolsTypeDoc({
          entryPoints: ["../../packages/tools/src/index.ts"],
          tsconfig: "../../packages/tools/tsconfig.build.json",
          output: "api/tools",
          sidebar: { label: "Tools API", collapsed: false },
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
            { label: "Sandboxed Tools", slug: "guides/tools" },
            { label: "Gotchas", slug: "guides/gotchas" },
          ],
        },
        {
          label: "Core",
          items: [{ autogenerate: { directory: "core" } }],
        },
        typeDocSidebarGroup,
        toolsTypeDocSidebarGroup,
      ],
    }),
  ],
});
