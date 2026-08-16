export type JsonTokenType =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "whitespace"
  | "plain";

export interface JsonToken {
  type: JsonTokenType;
  value: string;
}

/** Skip highlighting for huge payloads to keep the inspector snappy. */
const HIGHLIGHT_MAX_CHARS = 100_000;

export const JSON_TOKEN_CLASS: Record<JsonTokenType, string> = {
  key: "text-sky-700 dark:text-sky-300",
  string: "text-emerald-700 dark:text-emerald-400",
  number: "text-amber-700 dark:text-amber-500",
  boolean: "text-violet-700 dark:text-violet-400",
  null: "text-violet-700 dark:text-violet-400",
  punctuation: "text-muted-foreground",
  whitespace: "",
  plain: "",
};

export function highlightJson(text: string): JsonToken[] {
  if (text.length > HIGHLIGHT_MAX_CHARS) {
    return [{ type: "plain", value: text }];
  }

  const tokens: JsonToken[] = [];
  const stack: Array<"object" | "array"> = [];
  let expectingKey = false;
  let i = 0;

  const push = (type: JsonTokenType, value: string) => {
    tokens.push({ type, value });
  };

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      const start = i;
      i += 1;
      while (i < text.length) {
        const next = text[i]!;
        if (next !== " " && next !== "\n" && next !== "\r" && next !== "\t") break;
        i += 1;
      }
      push("whitespace", text.slice(start, i));
      continue;
    }

    if (ch === "{") {
      stack.push("object");
      expectingKey = true;
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === "}") {
      stack.pop();
      expectingKey = false;
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === "[") {
      stack.push("array");
      expectingKey = false;
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === "]") {
      stack.pop();
      expectingKey = false;
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === ",") {
      expectingKey = stack[stack.length - 1] === "object";
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === ":") {
      expectingKey = false;
      push("punctuation", ch);
      i += 1;
      continue;
    }

    if (ch === '"') {
      const end = readJsonString(text, i);
      push(expectingKey ? "key" : "string", text.slice(i, end));
      i = end;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const end = readJsonNumber(text, i);
      push("number", text.slice(i, end));
      i = end;
      continue;
    }

    if (matchKeyword(text, i, "true")) {
      push("boolean", "true");
      i += 4;
      continue;
    }

    if (matchKeyword(text, i, "false")) {
      push("boolean", "false");
      i += 5;
      continue;
    }

    if (matchKeyword(text, i, "null")) {
      push("null", "null");
      i += 4;
      continue;
    }

    push("plain", text.slice(i));
    break;
  }

  return tokens;
}

function readJsonString(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') {
      return i + 1;
    }
    i += 1;
  }
  return text.length;
}

function readJsonNumber(text: string, start: number): number {
  let i = start;
  if (text[i] === "-") i += 1;
  while (i < text.length && text[i]! >= "0" && text[i]! <= "9") i += 1;
  if (text[i] === ".") {
    i += 1;
    while (i < text.length && text[i]! >= "0" && text[i]! <= "9") i += 1;
  }
  if (text[i] === "e" || text[i] === "E") {
    i += 1;
    if (text[i] === "+" || text[i] === "-") i += 1;
    while (i < text.length && text[i]! >= "0" && text[i]! <= "9") i += 1;
  }
  return i;
}

function matchKeyword(text: string, index: number, keyword: string): boolean {
  if (!text.startsWith(keyword, index)) return false;
  const next = text[index + keyword.length];
  return next === undefined || !/[A-Za-z0-9_]/.test(next);
}
