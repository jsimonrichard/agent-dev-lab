import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${process.env.ADL_SQLITE_PATH ?? ".data/agent-dev-lab.sqlite"}`,
  },
});
