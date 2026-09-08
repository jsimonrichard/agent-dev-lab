import { TextDecoder } from "node:util";

import { AdlError } from "@agent-dev-lab/core";
import TurndownService from "turndown";

/**
 * Reduces a fetched response body to readable text or markdown.
 *
 * **Library choice — `turndown` (house rule 2: don't hand-roll HTML-to-text).** Picked over the
 * alternatives on dependency weight, because `@agent-dev-lab/tools` is meant to be installable
 * on its own:
 *
 * | Candidate                            | Runtime packages added | Why not |
 * | ------------------------------------ | ---------------------- | ------- |
 * | **`turndown`**                       | **2** (`turndown` + `@mixmark-io/domino`) | **chosen** — MIT, actively released, pure JS, and it bundles its own DOM so it behaves identically under Bun and Node |
 * | `node-html-markdown`                 | 2 (`node-html-parser`) | comparable, but less widely exercised |
 * | `html-to-text`                       | 6 (`htmlparser2`, `selderee`, …) | plain text only, three times the tree |
 * | `@mozilla/readability` + `linkedom`  | 7 | best extraction quality, but seven packages, and readability targets a jsdom-grade DOM — `linkedom` compatibility is claimed rather than guaranteed |
 *
 * **Stated gap:** `turndown` converts markup; it does not identify a page's main article. Site
 * navigation, sidebars and footers therefore survive into the markdown. Readability-grade
 * boilerplate stripping is the seven-package option above and is **not** implemented here.
 *
 * **Untrusted content.** Nothing in this module executes, evaluates or resolves anything from the
 * response — it is string-to-string, the same posture `createBashTool` takes with a command's
 * stdout. Active elements (`<script>`, `<style>`, `<noscript>`, `<iframe>`, `<object>`,
 * `<embed>`, `<template>`, `<svg>`) are dropped *with their contents* before conversion, so
 * inline JavaScript and CSS never reach the model as text at all. That is a noise and
 * prompt-injection-surface reduction, not a sandbox: whatever remains is still third-party text
 * and is still untrusted — see `FETCH_URL_DESCRIPTION`.
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
  // constructor's parameter to its own fixed `Encoding` union, which a `charset` taken from an
  // arbitrary HTTP header does not fit. The Node built-in is the same WHATWG class typed as the
  // spec defines it (`string` label), so this is the upstream API rather than a cast around a
  // too-narrow type (house rule 2).
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
}).remove(ACTIVE_ELEMENTS);

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
