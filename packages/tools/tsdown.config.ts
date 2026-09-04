import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  unbundle: true,
  root: "src",
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  outExtensions: () => ({ js: ".js" }),
});
