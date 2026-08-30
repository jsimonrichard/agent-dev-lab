import { describe, expect, it } from "bun:test";

import { loadPromptFile, resolvePromptPath, shouldRereadPromptFileOnRender } from "./load";
import { renderPromptTemplate } from "./render";
import { TemplateEngine } from "./engine";
import { ADL_PROJECT_WATCH_ENV } from "../project/config";

describe("prompt / template file helpers", () => {
  it("resolves and loads the sample-agent fixture", () => {
    const absolute = resolvePromptPath(import.meta.url, "./fixtures/sample-agent.md");
    const source = loadPromptFile(absolute);
    expect(source).toContain("{{project}}");
    const rendered = renderPromptTemplate(new TemplateEngine(), source, { project: "Ada" });
    expect(rendered).toContain("Ada");
  });

  it("re-reads file-backed prompts only when the project watcher is on", () => {
    const previous = process.env[ADL_PROJECT_WATCH_ENV];
    try {
      delete process.env[ADL_PROJECT_WATCH_ENV];
      expect(shouldRereadPromptFileOnRender()).toBe(false);
      process.env[ADL_PROJECT_WATCH_ENV] = "1";
      expect(shouldRereadPromptFileOnRender()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env[ADL_PROJECT_WATCH_ENV];
      } else {
        process.env[ADL_PROJECT_WATCH_ENV] = previous;
      }
    }
  });
});
