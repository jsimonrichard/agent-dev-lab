import { TextDecoder } from "node:util";

import { AdlError } from "@agent-dev-lab/core";
import TurndownService from "turndown";

import { ALLOWED_URL_SCHEMES } from "./address-policy.ts";

/**
 * Reduces a fetched response body to readable text or markdown, dispatching on its declared MIME
 * type. Nothing here executes, evaluates, or resolves anything from the response — string to
 * string. See `README.md` for the `turndown` library choice (vs. the alternatives, and its stated
 * gap: it converts markup, it doesn't identify a page's main article), the untrusted-content
 * posture this implements, and why a `javascript:`/`data:` link or image source is stripped down
 * to its visible text rather than carried through as a link.
 */

/** Elements removed along with their content before HTML is converted. */
const ACTIVE_ELEMENTS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "template",
  "svg",
];

/**
 * Matches a URL's scheme per the WHATWG grammar (`scheme = alpha *( alpha / digit / "+" / "-" /
 * "." )`) — the same rule a browser uses to decide `href="javascript:..."` is absolute regardless
 * of context, not a heuristic of our own.
 */
const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * True for a relative reference (no scheme — safe, resolved against whatever the eventual
 * renderer's base URL is) or one whose scheme is `http`/`https` — the same allowlist `fetchUrl`
 * itself fetches under ({@link ALLOWED_URL_SCHEMES}), reused rather than restated. False for
 * `javascript:`, `data:`, `vbscript:`, `file:`, and every other scheme: this fetched page's
 * markup doesn't get to hand the eventual reader of this output a link that runs code or opens a
 * local file when clicked.
 */
function isFetchableLinkTarget(url: string): boolean {
  const [, scheme] = URL_SCHEME.exec(url.trim()) ?? [];
  return scheme === undefined || ALLOWED_URL_SCHEMES.includes(scheme.toLowerCase());
}

/** Content types converted from HTML to markdown. */
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/**
 * Content types returned as-is (already readable text: JSON, XML, CSV, plain text, markdown,
 * source code). `text/*` is covered by the prefix check in {@link isReadableTextType}; these are
 * the `application/*` types that are text despite not saying so.
 */
const TEXT_APPLICATION_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-ndjson",
  "application/yaml",
  "application/x-yaml",
]);

function isReadableTextType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    TEXT_APPLICATION_TYPES.has(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

export interface ParsedContentType {
  /** Lowercased `type/subtype`, parameters stripped. Empty when the header was absent. */
  mimeType: string;
  /** The `charset` parameter, lowercased, or `undefined` when unspecified. */
  charset?: string;
}

/**
 * Splits a `Content-Type` header into its MIME type and `charset`. A `null` header (the server
 * sent none) yields an empty `mimeType`, which {@link reduceToText} then refuses — guessing the
 * type of a body the server declined to label is exactly the silent fallback house rule 1 rules
 * out.
 */
export function parseContentType(header: string | null): ParsedContentType {
  if (header === null) {
    return { mimeType: "" };
  }
  const [rawType, ...params] = header.split(";");
  const mimeType = (rawType ?? "").trim().toLowerCase();
  for (const param of params) {
    const separator = param.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = param.slice(0, separator).trim().toLowerCase();
    if (name !== "charset") {
      continue;
    }
    // Quoted parameter values are legal (`charset="utf-8"`).
    const charset = param
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (charset !== "") {
      return { mimeType, charset: charset.toLowerCase() };
    }
  }
  return { mimeType };
}

/**
 * Decodes `body` using the response's declared charset. Defaults to UTF-8 only because that is
 * the charset a `Content-Type` without one *means* per the WHATWG encoding spec — a spec default,
 * not a guess. An unrecognized label throws rather than silently producing mojibake.
 */
function decode(body: Uint8Array, charset: string | undefined): string {
  const label = charset ?? "utf-8";
  // `node:util`'s `TextDecoder`, not the global one: `@types/bun` narrows the global
  // constructor to its own fixed `Encoding` union, which an arbitrary HTTP-header charset doesn't
  // fit. The Node one is the same WHATWG class typed per spec (`string` label) — no cast needed.
  let decoder;
  try {
    decoder = new TextDecoder(label);
  } catch (cause) {
    throw new AdlError(
      "INVALID_INPUT",
      `Response declared charset "${label}", which this runtime cannot decode.`,
      { cause },
    );
  }
  return decoder.decode(body);
}

/** Created once — a `TurndownService` holds only its rule set, and the rules never vary. */
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
})
  .remove(ACTIVE_ELEMENTS)
  // `addRule` checks custom rules before the built-ins (`Rules.prototype.add` unshifts), and a
  // `filter` that returns false falls through to the default `a`/`img` rule — so a fetchable
  // `href`/`src` still becomes a normal markdown link/image; only a scheme like `javascript:` or
  // `data:` is caught here and flattened to plain text instead.
  .addRule("nonFetchableLink", {
    filter: (node) =>
      node.nodeName === "A" && !isFetchableLinkTarget(node.getAttribute("href") ?? ""),
    replacement: (content) => content,
  })
  .addRule("nonFetchableImage", {
    filter: (node) =>
      node.nodeName === "IMG" && !isFetchableLinkTarget(node.getAttribute("src") ?? ""),
    replacement: (_content, node) => node.getAttribute("alt") ?? "",
  });

export interface ReducedContent {
  /** The readable text. Markdown when the source was HTML, otherwise the decoded body. */
  text: string;
  /** `true` when the source was HTML converted to markdown, `false` when returned as-is. */
  markdown: boolean;
}

/**
 * Reduces a response body to readable text, dispatching on its declared MIME type: HTML becomes
 * markdown, other text types are decoded and returned unchanged, and anything else — an image,
 * a PDF, a tarball, or a body with no `Content-Type` at all — is **refused by name** rather than
 * decoded into garbage.
 */
export function reduceToText(body: Uint8Array, contentType: ParsedContentType): ReducedContent {
  const { mimeType, charset } = contentType;

  // A 204, a 304, or any other empty response. The unlabelled-body refusal below exists because
  // there is no way to know how to decode bytes the server declined to describe — with zero
  // bytes there is nothing to get wrong, so an absent Content-Type is not a reason to refuse.
  if (body.byteLength === 0 && mimeType === "") {
    return { text: "", markdown: false };
  }

  if (HTML_TYPES.has(mimeType)) {
    return { text: turndown.turndown(decode(body, charset)), markdown: true };
  }
  if (isReadableTextType(mimeType)) {
    return { text: decode(body, charset), markdown: false };
  }
  throw new AdlError(
    "INVALID_INPUT",
    mimeType === ""
      ? "Response carried no Content-Type header, so its body cannot be read as text."
      : `Response Content-Type "${mimeType}" is not readable text — this tool returns text and ` +
          `markdown only, not binary content.`,
  );
}
