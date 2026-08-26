/** Headings, lists, emphasis, code, links, quotes, or fenced blocks. */
const MARKDOWN_HINT =
  /(?:^|\n)\s{0,3}#{1,6}\s|(?:^|\n)\s*[-*+]\s|(?:^|\n)\s*\d+\.\s|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?:^|\n)\s*>\s|(?:^|\n)\s*```/;

/** Entire string is a URL, not a sentence that happens to contain one. */
const BARE_LINK = /^(?:https?:\/\/|www\.)\S+$/i;

/**
 * True when a JSON string should render as markdown instead of an inline
 * primitive. Single tokens (ids, kebab-case labels) and bare URLs stay inline.
 */
export function looksLikeProse(value: string): boolean {
  if (value.length === 0) return false;
  if (value.includes("\n")) return true;
  if (MARKDOWN_HINT.test(value)) return true;
  const trimmed = value.trim();
  if (BARE_LINK.test(trimmed)) return false;
  return /\s/.test(trimmed);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Clipboard payload for a JSON node: raw strings, pretty JSON for objects/arrays. */
export function valueToClipboardText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
