import type { WorkflowInputField, WorkflowInputFieldKind } from "#/lib/inspector-types";

/**
 * Walk a Zod schema without `instanceof` so it works across duplicate `zod` copies
 * (playground vs web vs core).
 */
interface ZodLike {
  _def?: {
    typeName?: string;
    type?: string;
    innerType?: ZodLike;
    schema?: ZodLike;
    shape?: (() => Record<string, ZodLike>) | Record<string, ZodLike>;
    values?: unknown;
    description?: string;
  };
  shape?: Record<string, ZodLike>;
  description?: string;
}

function typeName(schema: ZodLike): string | undefined {
  return schema._def?.typeName ?? schema._def?.type;
}

function descriptionOf(schema: ZodLike): string | undefined {
  return schema.description ?? schema._def?.description;
}

function unwrap(schema: ZodLike): { inner: ZodLike; required: boolean; description?: string } {
  let inner = schema;
  let required = true;
  let description = descriptionOf(schema);

  for (let i = 0; i < 16; i++) {
    const name = typeName(inner);
    if (!description) {
      description = descriptionOf(inner);
    }
    if (
      name === "ZodOptional" ||
      name === "ZodNullable" ||
      name === "optional" ||
      name === "nullable"
    ) {
      required = false;
      inner = inner._def?.innerType ?? inner;
      continue;
    }
    if (name === "ZodDefault" || name === "default") {
      required = false;
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

  return { inner, required, description };
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
    const values = schema._def?.values;
    const options = Array.isArray(values)
      ? values.filter((v): v is string => typeof v === "string")
      : [];
    return { kind: "string", options: options.length > 0 ? options : undefined };
  }
  return { kind: "json" };
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
    };
  });
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
      input[field.name] = raw === true || raw === "true";
      continue;
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
