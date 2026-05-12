const token = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Minimal mustache-style rendering for markdown prompts (no MDX, no frontmatter).
 * Unknown keys are left untouched so templates can include literal `{{example}}` later if escaped.
 */
export function renderPromptTemplate(template: string, variables: Record<string, string>): string {
  return template.replaceAll(token, (match, key: string) => {
    if (Object.hasOwn(variables, key)) {
      return variables[key] ?? '';
    }
    return match;
  });
}
