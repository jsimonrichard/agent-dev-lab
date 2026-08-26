/** Headings, lists, emphasis, code, links, quotes, or fenced blocks. */
const MARKDOWN_HINT =
  /(?:^|\n)\s{0,3}#{1,6}\s|(?:^|\n)\s*[-*+]\s|(?:^|\n)\s*\d+\.\s|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|(?:^|\n)\s*>\s|(?:^|\n)\s*```/;

const LONG_PROSE_CHARS = 120;

/**
 * True when a JSON string is worth rendering as markdown instead of an inline
 * primitive (ids, URLs, short labels stay inline).
 */
export function looksLikeProse(value: string): boolean {
  if (value.length === 0) return false;
  if (value.includes("\n")) return true;
  if (MARKDOWN_HINT.test(value)) return true;
  return value.length >= LONG_PROSE_CHARS && value.includes(" ");
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
