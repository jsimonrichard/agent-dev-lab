import { err, ok, type Result } from "@agent-dev-lab/core/result";

import type { JsonSchemaType, WorkflowInputField } from "#/lib/inspector/inspector-types";
import type { JsonValue } from "#/lib/view-model/types";
import { isPlainObject } from "@/lib/json-document";

export type JsonPath = Array<string | number>;

export const JSON_INSERT_TYPES = ["string", "number", "boolean", "object", "array"] as const;
export type JsonInsertType = (typeof JSON_INSERT_TYPES)[number];

export function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return isPlainObject(value);
}

export function defaultJsonValue(type: JsonInsertType): JsonValue {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    default: {
      const exhaustive: never = type;
      throw new Error(`unknown JSON insert type: ${String(exhaustive)}`);
    }
  }
}

export function jsonValuesEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type FieldValueAction = { kind: "clear" } | { kind: "reset"; next: JsonValue };

/** Clear omits an optional value. Reset restores a required field's schema default. */
export function fieldValueAction(args: {
  optional: boolean;
  defaultValue?: JsonValue;
  value: JsonValue | undefined;
}): FieldValueAction | undefined {
  if (args.optional) {
    return args.value === undefined ? undefined : { kind: "clear" };
  }
  if (args.defaultValue === undefined || jsonValuesEqual(args.value, args.defaultValue)) {
    return undefined;
  }
  return { kind: "reset", next: args.defaultValue };
}

export function defaultValueForJsonType(schema: JsonSchemaType): JsonValue {
  switch (schema.type) {
    case "string":
      return schema.options && schema.options[0] !== undefined ? schema.options[0] : "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "literal":
      return schema.value;
    case "array":
      return [];
    case "object":
      return {};
    case "union": {
      const first = schema.options[0];
      if (!first) {
        throw new Error("json editor union has no options");
      }
      return defaultValueForJsonType(first);
    }
    case "json":
      return "";
    default: {
      const exhaustive: never = schema;
      throw new Error(`unknown JSON schema type: ${String(exhaustive)}`);
    }
  }
}

export function jsonTypeLabel(schema: JsonSchemaType): string {
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "literal":
      return JSON.stringify(schema.value);
    case "array":
      return schema.items.type === "json" ? "array" : `${jsonTypeLabel(schema.items)}[]`;
    case "object":
      return "object";
    case "union":
      return schema.options.map(jsonTypeLabel).join(" | ");
    case "json":
      return "json";
    default: {
      const exhaustive: never = schema;
      throw new Error(`unknown JSON schema type: ${String(exhaustive)}`);
    }
  }
}

/** Form string/boolean → JSON. Empty optional slots stay omitted (`undefined`). */
export function jsonValueFromSchemaField(
  field: WorkflowInputField,
  value: string | boolean | undefined,
): JsonValue | undefined {
  if (field.kind === "json") {
    throw new Error("json schema fields are serialized as text, not a typed JSON value");
  }
  if (field.kind === "boolean") {
    if (value === true || value === "true") {
      return true;
    }
    if (value === false || value === "false") {
      return false;
    }
    if (value === undefined || value === "") {
      return undefined;
    }
    throw new Error(`${field.name} must be a boolean`);
  }
  if (typeof value === "boolean") {
    throw new Error(`${field.name} must not be a boolean`);
  }
  if (value === undefined || value === "") {
    return undefined;
  }
  if (field.kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field.name} must be a finite number`);
    }
    return parsed;
  }
  if (field.kind === "string") {
    return value;
  }
  const exhaustive: never = field.kind;
  throw new Error(`unknown workflow field kind: ${String(exhaustive)}`);
}

/** JSON → form string/boolean. Omitted slots serialize as `""`. */
export function schemaFieldFromJsonValue(
  field: WorkflowInputField,
  value: JsonValue | undefined,
): string | boolean {
  if (field.kind === "json") {
    throw new Error("json schema fields are serialized as text, not a typed JSON value");
  }
  if (value === undefined) {
    return "";
  }
  if (field.kind === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${field.name} must be a boolean`);
    }
    return value;
  }
  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${field.name} must be a finite number`);
    }
    return String(value);
  }
  if (field.kind === "string") {
    if (typeof value !== "string") {
      throw new Error(`${field.name} must be a string`);
    }
    return value;
  }
  const exhaustive: never = field.kind;
  throw new Error(`unknown workflow field kind: ${String(exhaustive)}`);
}

export function jsonTypeFromField(field: WorkflowInputField): JsonSchemaType {
  if (field.kind === "json") {
    return field.jsonType ?? { type: "json" };
  }
  if (field.kind === "string") {
    return field.options && field.options.length > 0
      ? { type: "string", options: field.options }
      : { type: "string" };
  }
  if (field.kind === "number") {
    return { type: "number" };
  }
  if (field.kind === "boolean") {
    return { type: "boolean" };
  }
  const exhaustive: never = field.kind;
  throw new Error(`unknown workflow field kind: ${String(exhaustive)}`);
}

/** Object schema for a whole tool-context / workflow-input form. */
export function jsonTypeFromFields(fields: WorkflowInputField[]): JsonSchemaType {
  return {
    type: "object",
    extra: false,
    fields: fields.map((field) => ({
      name: field.name,
      required: field.required,
      schema: jsonTypeFromField(field),
      ...(field.default !== undefined ? { default: field.default } : {}),
    })),
  };
}

/** Zod-like reconstruction shown next to raw JSON so authors know what to match. */
export function jsonTypeToZodText(schema: JsonSchemaType): string {
  switch (schema.type) {
    case "string":
      return schema.options && schema.options.length > 0
        ? `z.enum([${schema.options.map((option) => JSON.stringify(option)).join(", ")}])`
        : "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "null":
      return "z.null()";
    case "literal":
      return `z.literal(${JSON.stringify(schema.value)})`;
    case "array":
      return `z.array(${jsonTypeToZodText(schema.items)})`;
    case "object": {
      if (schema.fields.length === 0) {
        return schema.extra ? "z.record(z.string(), z.unknown())" : "z.object({})";
      }
      const lines = schema.fields.map((field) => {
        const inner = jsonTypeToZodText(field.schema);
        const typed =
          field.default !== undefined
            ? `${inner}.default(${JSON.stringify(field.default)})`
            : field.required
              ? inner
              : `${inner}.optional()`;
        return `  ${JSON.stringify(field.name)}: ${typed}`;
      });
      const extra = schema.extra ? ".passthrough()" : "";
      return `z.object({\n${lines.join(",\n")}\n})${extra}`;
    }
    case "union": {
      if (schema.options.length === 0) {
        throw new Error("json schema union has no options");
      }
      if (schema.options.length === 1) {
        const only = schema.options[0];
        if (!only) {
          throw new Error("json schema union has no options");
        }
        return jsonTypeToZodText(only);
      }
      return `z.union([${schema.options.map(jsonTypeToZodText).join(", ")}])`;
    }
    case "json":
      return "z.unknown()";
    default: {
      const exhaustive: never = schema;
      throw new Error(`unknown JSON schema type: ${String(exhaustive)}`);
    }
  }
}

const UNTYPED_VARIANTS: JsonSchemaType[] = [
  { type: "string" },
  { type: "number" },
  { type: "boolean" },
  { type: "object", fields: [], extra: true },
  { type: "array", items: { type: "json" } },
];

/** Concrete variants the editor may switch between (untyped JSON gets the generic set). */
export function editorVariants(schema: JsonSchemaType | undefined): JsonSchemaType[] {
  if (!schema || schema.type === "json") {
    return UNTYPED_VARIANTS;
  }
  if (schema.type === "union") {
    return schema.options;
  }
  return [schema];
}

/**
 * Which variant the document editor should show. Optional slots keep `undefined`
 * unset instead of pretending the first variant (often an array) is selected.
 */
export function resolveEditorVariant(
  value: JsonValue | undefined,
  variants: JsonSchemaType[],
  optional: boolean,
): JsonSchemaType | undefined {
  if (variants.length === 0) {
    throw new Error("json editor has no type variants");
  }
  if (value === undefined) {
    return optional ? undefined : variants[0];
  }
  return matchUnionOption(value, variants) ?? variants[0];
}

export function valueMatchesJsonType(value: JsonValue, schema: JsonSchemaType): boolean {
  switch (schema.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "literal":
      return value === schema.value;
    case "array":
      return (
        Array.isArray(value) && value.every((item) => valueMatchesJsonType(item, schema.items))
      );
    case "object": {
      if (!isJsonObject(value)) {
        return false;
      }
      for (const field of schema.fields) {
        if (!Object.hasOwn(value, field.name)) {
          if (field.required) {
            return false;
          }
          continue;
        }
        const child = value[field.name];
        if (child === undefined || !valueMatchesJsonType(child, field.schema)) {
          return false;
        }
      }
      if (!schema.extra) {
        const known = new Set(schema.fields.map((field) => field.name));
        for (const key of Object.keys(value)) {
          if (!known.has(key)) {
            return false;
          }
        }
      }
      return true;
    }
    case "union":
      return matchUnionOption(value, schema.options) !== undefined;
    case "json":
      return true;
    default: {
      const exhaustive: never = schema;
      throw new Error(`unknown JSON schema type: ${String(exhaustive)}`);
    }
  }
}

export function matchUnionOption(
  value: JsonValue,
  options: JsonSchemaType[],
): JsonSchemaType | undefined {
  const literals = options.filter((option) => option.type === "literal");
  const rest = options.filter((option) => option.type !== "literal");
  for (const option of [...literals, ...rest]) {
    if (valueMatchesJsonType(value, option)) {
      return option;
    }
  }
  return undefined;
}

export function composerNeedsText(schema: JsonSchemaType): boolean {
  return schema.type === "string" || schema.type === "number" || schema.type === "json";
}

export function valueFromComposerDraft(
  schema: JsonSchemaType,
  draft: string,
): Result<JsonValue, string> {
  if (schema.type === "string") {
    return ok(draft);
  }
  if (schema.type === "json") {
    const parsed = parseJsonText(draft);
    if (parsed.isErr) {
      return parsed;
    }
    if (parsed.value === undefined) {
      return ok("");
    }
    return ok(parsed.value);
  }
  if (schema.type === "number") {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return err("Number is required");
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return err("Must be a finite number");
    }
    return ok(parsed);
  }
  return ok(defaultValueForJsonType(schema));
}

export function stringifyJsonValue(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

export function asJsonValue(value: unknown): Result<JsonValue, string> {
  if (value === null) {
    return ok(null);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return ok(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return err("JSON number must be finite");
    }
    return ok(value);
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const parsed = asJsonValue(item);
      if (parsed.isErr) {
        return parsed;
      }
      items.push(parsed.value);
    }
    return ok(items);
  }
  if (isPlainObject(value)) {
    const obj: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const parsed = asJsonValue(child);
      if (parsed.isErr) {
        return parsed;
      }
      obj[key] = parsed.value;
    }
    return ok(obj);
  }
  return err("Value is not JSON");
}

/** Empty / whitespace-only text is unset (`undefined`), not an invented value. */
export function parseJsonText(text: string): Result<JsonValue | undefined, string> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return ok(undefined);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
  return asJsonValue(parsed);
}

/** `null` when `text` is unset or valid JSON (and matches `jsonType` when given). */
export function jsonTextError(text: string, jsonType?: JsonSchemaType): string | null {
  const parsed = parseJsonText(text);
  if (parsed.isErr) {
    return parsed.error;
  }
  if (parsed.value === undefined) {
    return null;
  }
  if (
    jsonType !== undefined &&
    jsonType.type !== "json" &&
    !valueMatchesJsonType(parsed.value, jsonType)
  ) {
    return `Value does not match ${jsonTypeLabel(jsonType)}`;
  }
  return null;
}

export function workflowJsonFieldsError(
  fields: WorkflowInputField[],
  values: Record<string, string | boolean>,
): string | null {
  for (const field of fields) {
    if (field.kind !== "json") {
      continue;
    }
    const raw = values[field.name];
    const text = typeof raw === "string" ? raw : "";
    if (text.trim().length === 0) {
      continue;
    }
    const error = jsonTextError(text, field.jsonType);
    if (error) {
      return `${field.name} must be valid JSON: ${error}`;
    }
  }
  return null;
}

export type ContextEditorSource = "form" | "json";

export function toolProviderContextSource(
  fields: WorkflowInputField[],
  source?: ContextEditorSource,
): ContextEditorSource {
  if (fields.length === 0) {
    return "json";
  }
  return source ?? "form";
}

export function toolProviderContextJsonError(options: {
  fields: WorkflowInputField[];
  values: Record<string, string | boolean>;
  rawJson: string;
  source?: ContextEditorSource;
}): string | null {
  if (toolProviderContextSource(options.fields, options.source) === "json") {
    const jsonType = options.fields.length > 0 ? jsonTypeFromFields(options.fields) : undefined;
    const error = jsonTextError(options.rawJson, jsonType);
    return error === null ? null : `toolProviderContext must be valid JSON: ${error}`;
  }
  return workflowJsonFieldsError(options.fields, options.values);
}

export function getAtPath(root: JsonValue, path: JsonPath): JsonValue {
  let current: JsonValue = root;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`json editor path expected array index ${segment}`);
      }
      const next = current[segment];
      if (next === undefined) {
        throw new Error(`json editor path expected array index ${segment}`);
      }
      current = next;
      continue;
    }
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`json editor path expected object key ${JSON.stringify(segment)}`);
    }
    const next = current[segment];
    if (next === undefined) {
      throw new Error(`json editor path expected object key ${JSON.stringify(segment)}`);
    }
    current = next;
  }
  return current;
}

export function setAtPath(root: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  return replaceAt(root, path, value);
}

export function removeAtPath(root: JsonValue, path: JsonPath): JsonValue {
  if (path.length === 0) {
    throw new Error("json editor cannot remove the root");
  }
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  if (last === undefined) {
    throw new Error("json editor cannot remove the root");
  }
  const parent = parentPath.length === 0 ? root : getAtPath(root, parentPath);
  if (typeof last === "number") {
    if (!Array.isArray(parent)) {
      throw new Error("json editor remove expected an array");
    }
    if (last < 0 || last >= parent.length) {
      throw new Error(`json editor array index ${last} out of bounds`);
    }
    return replaceAt(
      root,
      parentPath,
      parent.filter((_, index) => index !== last),
    );
  }
  if (!isPlainObject(parent)) {
    throw new Error("json editor remove expected an object");
  }
  if (!Object.hasOwn(parent, last)) {
    throw new Error(`json editor remove missing key ${JSON.stringify(last)}`);
  }
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(parent)) {
    if (key !== last) {
      next[key] = child;
    }
  }
  return replaceAt(root, parentPath, next);
}

export function insertArrayItem(
  root: JsonValue,
  path: JsonPath,
  value: JsonValue,
  index?: number,
): JsonValue {
  const target = path.length === 0 ? root : getAtPath(root, path);
  if (!Array.isArray(target)) {
    throw new Error("json editor insert expected an array");
  }
  const at = index ?? target.length;
  if (at < 0 || at > target.length) {
    throw new Error(`json editor insert index ${at} out of bounds`);
  }
  return replaceAt(root, path, [...target.slice(0, at), value, ...target.slice(at)]);
}

export function addObjectKey(
  root: JsonValue,
  path: JsonPath,
  key: string,
  value: JsonValue,
): Result<JsonValue, string> {
  if (key.length === 0) {
    return err("Key cannot be empty");
  }
  const target = path.length === 0 ? root : getAtPath(root, path);
  if (!isPlainObject(target)) {
    throw new Error("json editor add key expected an object");
  }
  if (Object.hasOwn(target, key)) {
    return err(`Key "${key}" already exists`);
  }
  return ok(replaceAt(root, path, { ...target, [key]: value }));
}

export function renameObjectKey(
  root: JsonValue,
  path: JsonPath,
  from: string,
  to: string,
): Result<JsonValue, string> {
  if (to.length === 0) {
    return err("Key cannot be empty");
  }
  const target = path.length === 0 ? root : getAtPath(root, path);
  if (!isPlainObject(target)) {
    throw new Error("json editor rename expected an object");
  }
  if (!Object.hasOwn(target, from)) {
    throw new Error(`json editor rename missing key ${JSON.stringify(from)}`);
  }
  if (from === to) {
    return ok(root);
  }
  if (Object.hasOwn(target, to)) {
    return err(`Key "${to}" already exists`);
  }
  const renamed: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(target)) {
    renamed[key === from ? to : key] = child;
  }
  return ok(replaceAt(root, path, renamed));
}

function replaceAt(root: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  if (path.length === 0) {
    return value;
  }
  const [head, ...rest] = path;
  if (head === undefined) {
    return value;
  }
  if (typeof head === "number") {
    if (!Array.isArray(root)) {
      throw new Error("json editor path expected array");
    }
    if (head < 0 || head >= root.length) {
      throw new Error(`json editor array index ${head} out of bounds`);
    }
    const child = root[head];
    if (child === undefined) {
      throw new Error(`json editor array index ${head} out of bounds`);
    }
    const copy = [...root];
    copy[head] = replaceAt(child, rest, value);
    return copy;
  }
  if (!isPlainObject(root)) {
    throw new Error("json editor path expected object");
  }
  if (rest.length > 0 && !Object.hasOwn(root, head)) {
    throw new Error(`json editor missing key ${JSON.stringify(head)}`);
  }
  const child = Object.hasOwn(root, head) ? root[head] : undefined;
  if (rest.length > 0) {
    if (child === undefined) {
      throw new Error(`json editor missing key ${JSON.stringify(head)}`);
    }
    return { ...root, [head]: replaceAt(child, rest, value) };
  }
  return { ...root, [head]: value };
}
