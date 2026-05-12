import Handlebars from "handlebars";
import { randomUUID } from "node:crypto";

const token = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

const handlebars = Handlebars.create();

/**
 * Renders markdown prompts with Handlebars (no HTML escaping; plain text).
 * Keys are flat `Record` entries; dots in a key are not treated as nested paths
 * (`{{ a.b }}` reads `variables["a.b"]` via `lookup`).
 * Placeholders whose keys are missing from `variables` are left as the original `{{ ... }}` text.
 */
export function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  const restored: string[] = [];
  const markerPrefix = `\uE000${randomUUID()}\uE001`;

  const processed = template.replaceAll(token, (match, key: string) => {
    if (Object.hasOwn(variables, key)) {
      return `{{lookup __vars "${key}"}}`;
    }
    const idx = restored.length;
    restored.push(match);
    return `${markerPrefix}:${idx}`;
  });

  const render = handlebars.compile(processed, { noEscape: true });
  let out = render({ __vars: variables }) as string;

  for (let i = 0; i < restored.length; i++) {
    const marker = `${markerPrefix}:${i}`;
    out = out.split(marker).join(restored[i] ?? "");
  }

  return out;
}
