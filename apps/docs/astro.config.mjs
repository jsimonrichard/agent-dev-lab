// @ts-check
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

const require = createRequire(import.meta.url);
const runtimeRoot = dirname(
  require.resolve("@agent-dev-lab/runtime/package.json"),
);

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
          entryPoints: [join(runtimeRoot, "src", "index.ts")],
          tsconfig: join(runtimeRoot, "tsconfig.json"),
          sidebar: { label: "Runtime API", collapsed: false },
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
