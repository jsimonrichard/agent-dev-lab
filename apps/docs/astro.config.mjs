// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Agent Development Lab",
      description: "Documentation for the Agent Development Lab monorepo.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/",
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../../packages/core/src/index.ts"],
          tsconfig: "../../packages/core/tsconfig.json",
          sidebar: { label: "Core API", collapsed: false },
        }),
      ],
      sidebar: [
        {
          label: "Guides",
          items: [{ label: "Overview", slug: "guides/overview" }],
        },
        typeDocSidebarGroup,
      ],
    }),
  ],
});
