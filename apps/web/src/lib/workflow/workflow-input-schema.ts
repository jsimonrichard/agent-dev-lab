import type {
  JsonSchemaType,
  WorkflowInputField,
  WorkflowInputFieldKind,
} from "#/lib/inspector/inspector-types";
import type { JsonValue } from "#/lib/view-model/types";
import { MAX_JSON_TREE_DEPTH } from "@/lib/json-document";

/**
 * Walk a Zod schema without `instanceof` so it works across duplicate `zod` copies
 * (playground vs web vs core).
 */
interface ZodLike {
  _def?: {
    typeName?: string;
    type?: string | ZodLike;
    innerType?: ZodLike;
    schema?: ZodLike;
    shape?: (() => Record<string, ZodLike>) | Record<string, ZodLike>;
    values?: unknown;
    entries?: unknown;
    element?: ZodLike;
    options?: unknown;
    getter?: () => ZodLike;
    description?: string;
    defaultValue?: unknown | (() => unknown);
  };
  shape?: Record<string, ZodLike>;
  element?: ZodLike;
  description?: string;
}

function typeName(schema: ZodLike): string | undefined {
  if (schema._def?.typeName) {
    return schema._def.typeName;
  }
  return typeof schema._def?.type === "string" ? schema._def.type : undefined;
}

function descriptionOf(schema: ZodLike): string | undefined {
  return schema.description ?? schema._def?.description;
}

function isUndefinedType(schema: ZodLike): boolean {
  const name = typeName(schema);
  return name === "ZodUndefined" || name === "undefined";
}

function jsonDefault(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return undefined;
  }
}

function defaultOf(schema: ZodLike): JsonValue | undefined {
  const raw = schema._def?.defaultValue;
  return jsonDefault(typeof raw === "function" ? raw() : raw);
}

function unwrap(schema: ZodLike): {
  inner: ZodLike;
  required: boolean;
  description?: string;
  default?: JsonValue;
} {
  let inner = schema;
  let required = true;
  let description = descriptionOf(schema);
  let defaultValue: JsonValue | undefined;

  for (let i = 0; i < 16; i++) {
    const name = typeName(inner);
    if (!description) {
      description = descriptionOf(inner);
    }
    if (
      name === "ZodOptional" ||
      name === "ZodNullable" ||
      name === "optional" ||
      name === "nullable" ||
      name === "nullish"
    ) {
      required = false;
      inner = inner._def?.innerType ?? inner;
      continue;
    }
    if (name === "ZodUnion" || name === "union") {
      const members = unionMembers(inner);
      const defined = members.filter((member) => !isUndefinedType(member));
      if (defined.length > 0 && defined.length < members.length) {
        required = false;
        if (defined.length === 1) {
          const only = defined[0];
          if (!only) {
            throw new Error("optional union dropped its only defined member");
          }
          inner = only;
          continue;
        }
      }
    }
    if (name === "ZodDefault" || name === "default") {
      if (defaultValue === undefined) {
        defaultValue = defaultOf(inner);
      }
      inner = inner._def?.innerType ?? inner;
      continue;
    }
    if (name === "ZodEffects" || name === "ZodPipe" || name === "pipe") {
      inner = inner._def?.schema ?? inner._def?.innerType ?? inner;
      continue;
    }
    if (
      name === "ZodBranded" ||
      name === "ZodCatch" ||
      name === "ZodReadonly" ||
      name === "readonly"
    ) {
      inner = inner._def?.innerType ?? inner._def?.schema ?? inner;
      continue;
    }
    break;
  }

  return { inner, required, description, default: defaultValue };
}

function objectShape(schema: ZodLike): Record<string, ZodLike> | null {
  if (schema.shape && typeof schema.shape === "object") {
    return schema.shape;
  }
  const shape = schema._def?.shape;
  if (typeof shape === "function") {
    return shape();
  }
  if (shape && typeof shape === "object") {
    return shape;
  }
  return null;
}

function fieldKind(schema: ZodLike): { kind: WorkflowInputFieldKind; options?: string[] } {
  const name = typeName(schema);
  if (name === "ZodString" || name === "string") {
    return { kind: "string" };
  }
  if (name === "ZodNumber" || name === "number") {
    return { kind: "number" };
  }
  if (name === "ZodBoolean" || name === "boolean") {
    return { kind: "boolean" };
  }
  if (name === "ZodEnum" || name === "enum") {
    const options = enumOptions(schema);
    return { kind: "string", options: options.length > 0 ? options : undefined };
  }
  return { kind: "json" };
}

function enumOptions(schema: ZodLike): string[] {
  const values = schema._def?.values;
  if (Array.isArray(values)) {
    return values.filter((value): value is string => typeof value === "string");
  }
  const entries = schema._def?.entries;
  if (entries && typeof entries === "object" && !Array.isArray(entries)) {
    return Object.values(entries).filter((value): value is string => typeof value === "string");
  }
  return [];
}

function arrayElement(schema: ZodLike): ZodLike | undefined {
  if (schema._def?.element && typeof schema._def.element === "object") {
    return schema._def.element;
  }
  if (schema.element && typeof schema.element === "object") {
    return schema.element;
  }
  if (
    typeName(schema) === "ZodArray" &&
    schema._def?.type &&
    typeof schema._def.type === "object"
  ) {
    return schema._def.type;
  }
  return undefined;
}

function unionMembers(schema: ZodLike): ZodLike[] {
  const options = schema._def?.options;
  if (!Array.isArray(options)) {
    return [];
  }
  return options.filter(
    (option): option is ZodLike => typeof option === "object" && option !== null,
  );
}

function literalValue(schema: ZodLike): string | number | boolean | undefined {
  const values = schema._def?.values;
  if (!Array.isArray(values) || values.length !== 1) {
    return undefined;
  }
  const value = values[0];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function collapseUnion(options: JsonSchemaType[]): JsonSchemaType {
  if (options.length === 0) {
    return { type: "json" };
  }
  if (options.length === 1) {
    const only = options[0];
    if (!only) {
      return { type: "json" };
    }
    return only;
  }
  return { type: "union", options };
}

/**
 * Nested JSON editor type. Non-JSON members (e.g. `instanceof(RegExp)`) are dropped
 * from unions; if nothing representable remains, the editor falls back to raw JSON.
 */
export function describeJsonType(schema: unknown, depth = 0): JsonSchemaType {
  const described = describeJsonTypeInner(schema, depth);
  return described === "unrepresentable" ? { type: "json" } : described;
}

function describeJsonTypeInner(schema: unknown, depth: number): JsonSchemaType | "unrepresentable" {
  if (depth >= MAX_JSON_TREE_DEPTH || !schema || typeof schema !== "object") {
    return { type: "json" };
  }

  const zod = schema as ZodLike;
  let inner = zod;
  let includesNull = false;

  for (let i = 0; i < 16; i++) {
    const name = typeName(inner);
    if (
      name === "ZodOptional" ||
      name === "optional" ||
      name === "ZodDefault" ||
      name === "default" ||
      name === "ZodEffects" ||
      name === "ZodPipe" ||
      name === "pipe" ||
      name === "ZodBranded" ||
      name === "ZodCatch" ||
      name === "ZodReadonly" ||
      name === "readonly"
    ) {
      inner = inner._def?.innerType ?? inner._def?.schema ?? inner;
      continue;
    }
    if (name === "ZodNullable" || name === "nullable" || name === "nullish") {
      includesNull = true;
      inner = inner._def?.innerType ?? inner;
      continue;
    }
    if (name === "lazy" || name === "ZodLazy") {
      const getter = inner._def?.getter;
      if (typeof getter !== "function") {
        return { type: "json" };
      }
      inner = getter();
      continue;
    }
    break;
  }

  const described = describeConcreteJsonType(inner, depth);
  if (described === "unrepresentable" && !includesNull) {
    return "unrepresentable";
  }
  const options: JsonSchemaType[] = [
    ...(described === "unrepresentable" ? [] : [described]),
    ...(includesNull ? [{ type: "null" as const }] : []),
  ];
  return collapseUnion(options);
}

function describeConcreteJsonType(
  schema: ZodLike,
  depth: number,
): JsonSchemaType | "unrepresentable" {
  const name = typeName(schema);
  if (name === "ZodString" || name === "string") {
    return { type: "string" };
  }
  if (name === "ZodNumber" || name === "number") {
    return { type: "number" };
  }
  if (name === "ZodBoolean" || name === "boolean") {
    return { type: "boolean" };
  }
  if (name === "ZodNull" || name === "null") {
    return { type: "null" };
  }
  if (name === "ZodLiteral" || name === "literal") {
    const value = literalValue(schema);
    return value === undefined ? { type: "json" } : { type: "literal", value };
  }
  if (name === "ZodEnum" || name === "enum") {
    const options = enumOptions(schema);
    return { type: "string", options: options.length > 0 ? options : undefined };
  }
  if (name === "ZodArray" || name === "array") {
    const element = arrayElement(schema);
    return {
      type: "array",
      items: element ? describeJsonType(element, depth + 1) : { type: "json" },
    };
  }
  if (name === "ZodUnion" || name === "union") {
    const representable = unionMembers(schema).flatMap((member) => {
      if (isUndefinedType(member)) {
        return [];
      }
      const described = describeJsonTypeInner(member, depth + 1);
      return described === "unrepresentable" ? [] : [described];
    });
    return collapseUnion(representable);
  }
  if (name === "ZodObject" || name === "object") {
    const shape = objectShape(schema);
    if (!shape) {
      return { type: "json" };
    }
    return {
      type: "object",
      extra: false,
      fields: Object.entries(shape).map(([fieldName, fieldSchema]) => {
        const unwrapped = unwrap(fieldSchema);
        return {
          name: fieldName,
          required: unwrapped.required,
          schema: describeJsonType(fieldSchema, depth + 1),
          ...(unwrapped.default !== undefined ? { default: unwrapped.default } : {}),
          ...(unwrapped.description !== undefined ? { description: unwrapped.description } : {}),
        };
      }),
    };
  }
  if (name === "ZodUnknown" || name === "unknown" || name === "ZodAny" || name === "any") {
    return { type: "json" };
  }
  return "unrepresentable";
}

export function describeWorkflowInput(schema: unknown): WorkflowInputField[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const { inner } = unwrap(schema);
  const shape = objectShape(inner);
  if (!shape) {
    return [];
  }

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const unwrapped = unwrap(fieldSchema);
    const { kind, options } = fieldKind(unwrapped.inner);
    return {
      name,
      kind,
      required: unwrapped.required,
      description: unwrapped.description,
      options,
      ...(unwrapped.default !== undefined ? { default: unwrapped.default } : {}),
      ...(kind === "json" ? { jsonType: describeJsonType(fieldSchema) } : {}),
    };
  });
}

/**
 * Apply the live workflow input schema to `{}` so defaults/refinements come from
 * the reloaded definition — same path as {@link WorkflowImpl} uses at run time.
 */
export function sampleWorkflowInput(schema: unknown): JsonValue | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const parser = schema as {
    safeParse?: (value: unknown) => { success: boolean; data?: unknown };
  };
  if (typeof parser.safeParse !== "function") {
    return undefined;
  }
  const parsed = parser.safeParse({});
  return parsed.success ? (parsed.data as JsonValue) : undefined;
}

export function workflowInputValuesFromSample(
  fields: WorkflowInputField[],
  sample: JsonValue | undefined,
): Record<string, string | boolean> {
  if (!sample || typeof sample !== "object") {
    return {};
  }

  const record = sample as Record<string, unknown>;
  const values: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = record[field.name];
    if (raw === undefined) {
      continue;
    }
    if (field.kind === "boolean") {
      values[field.name] = Boolean(raw);
      continue;
    }
    if (field.kind === "json") {
      values[field.name] = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      continue;
    }
    values[field.name] = String(raw);
  }
  return values;
}

export function buildWorkflowInput(
  fields: WorkflowInputField[],
  values: Record<string, string | boolean>,
): unknown {
  if (fields.length === 0) {
    return {};
  }

  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.kind === "boolean") {
      if (raw === true || raw === "true") {
        input[field.name] = true;
        continue;
      }
      if (raw === false || raw === "false") {
        input[field.name] = false;
        continue;
      }
      if (raw === undefined || raw === "") {
        if (field.required) {
          throw new Error(`${field.name} is required`);
        }
        continue;
      }
      throw new Error(`${field.name} must be a boolean`);
    }

    const text = typeof raw === "string" ? raw.trim() : "";
    if (text.length === 0) {
      if (field.required) {
        throw new Error(`${field.name} is required`);
      }
      continue;
    }

    if (field.kind === "number") {
      const parsed = Number(text);
      if (Number.isNaN(parsed)) {
        throw new Error(`${field.name} must be a number`);
      }
      input[field.name] = parsed;
      continue;
    }

    if (field.kind === "json") {
      try {
        input[field.name] = JSON.parse(text) as unknown;
      } catch (error) {
        throw new Error(
          `${field.name} must be valid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
        );
      }
      continue;
    }

    input[field.name] = text;
  }

  return input;
}
