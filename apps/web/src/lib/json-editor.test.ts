import { describe, expect, it } from "bun:test";

import {
  addObjectKey,
  asJsonValue,
  defaultJsonValue,
  defaultValueForJsonType,
  editorVariants,
  getAtPath,
  insertArrayItem,
  jsonTypeFromFields,
  jsonValueFromSchemaField,
  jsonTypeLabel,
  schemaFieldFromJsonValue,
  jsonTypeToZodText,
  matchUnionOption,
  parseJsonText,
  jsonTextError,
  resolveEditorVariant,
  toolProviderContextJsonError,
  removeAtPath,
  renameObjectKey,
  setAtPath,
  stringifyJsonValue,
  valueMatchesJsonType,
} from "./json-editor";

const nested = {
  allowWrite: ["src", "tmp"],
  flags: { dryRun: true, retries: 2 },
};

describe("defaultJsonValue", () => {
  it("returns a typed empty node for each insert type", () => {
    expect(defaultJsonValue("string")).toBe("");
    expect(defaultJsonValue("number")).toBe(0);
    expect(defaultJsonValue("boolean")).toBe(false);
    expect(defaultJsonValue("object")).toEqual({});
    expect(defaultJsonValue("array")).toEqual([]);
  });
});

describe("schema-driven defaults", () => {
  it("defaults follow the concrete JSON schema type", () => {
    expect(defaultValueForJsonType({ type: "string" })).toBe("");
    expect(defaultValueForJsonType({ type: "array", items: { type: "string" } })).toEqual([]);
    expect(defaultValueForJsonType({ type: "literal", value: "**" })).toBe("**");
    expect(defaultValueForJsonType({ type: "null" })).toBeNull();
  });

  it("labels array-of-string as string[] rather than a generic json type", () => {
    expect(jsonTypeLabel({ type: "array", items: { type: "string" } })).toBe("string[]");
  });

  it("does not offer string/number/boolean when the schema is a string array", () => {
    expect(editorVariants({ type: "array", items: { type: "string" } })).toEqual([
      { type: "array", items: { type: "string" } },
    ]);
  });

  it("round-trips omitted vs zero for an optional number field", () => {
    const field = { name: "maxWriteBytes", kind: "number" as const, required: false };
    expect(jsonValueFromSchemaField(field, "")).toBeUndefined();
    expect(jsonValueFromSchemaField(field, "0")).toBe(0);
    expect(schemaFieldFromJsonValue(field, undefined)).toBe("");
    expect(schemaFieldFromJsonValue(field, 0)).toBe("0");
  });

  it("keeps explicit false distinct from omitted for optional booleans", () => {
    const field = { name: "allowNetwork", kind: "boolean" as const, required: false };
    expect(jsonValueFromSchemaField(field, "")).toBeUndefined();
    expect(jsonValueFromSchemaField(field, false)).toBe(false);
    expect(schemaFieldFromJsonValue(field, undefined)).toBe("");
    expect(schemaFieldFromJsonValue(field, false)).toBe(false);
  });

  it("keeps optional slots unset instead of selecting the first union member", () => {
    const variants = [
      { type: "array" as const, items: { type: "string" as const } },
      { type: "boolean" as const },
    ];
    expect(resolveEditorVariant(undefined, variants, true)).toBeUndefined();
    expect(resolveEditorVariant(undefined, variants, false)).toEqual(variants[0]);
    expect(resolveEditorVariant(false, variants, true)).toEqual({ type: "boolean" });
    expect(resolveEditorVariant(["src"], variants, true)).toEqual(variants[0]);
  });

  it("matches array items and object fields recursively", () => {
    const allowWrite = { type: "array" as const, items: { type: "string" as const } };
    expect(valueMatchesJsonType(["src"], allowWrite)).toBe(true);
    expect(valueMatchesJsonType([1], allowWrite)).toBe(false);
    const objectType = {
      type: "object" as const,
      extra: false,
      fields: [{ name: "allowWrite", required: false, schema: allowWrite }],
    };
    expect(valueMatchesJsonType({ allowWrite: ["src"] }, objectType)).toBe(true);
    expect(valueMatchesJsonType({ allowWrite: ["src"], extra: true }, objectType)).toBe(false);
  });

  it("builds Zod text from a nested array field", () => {
    expect(
      jsonTypeFromFields([
        {
          name: "allowWrite",
          kind: "json",
          required: false,
          jsonType: { type: "array", items: { type: "string" } },
        },
      ]),
    ).toEqual({
      type: "object",
      extra: false,
      fields: [
        {
          name: "allowWrite",
          required: false,
          schema: { type: "array", items: { type: "string" } },
        },
      ],
    });
    expect(jsonTypeToZodText({ type: "array", items: { type: "string" } })).toBe(
      "z.array(z.string())",
    );
  });

  it("renders Zod .default() instead of .optional() for defaulted fields", () => {
    expect(
      jsonTypeToZodText({
        type: "object",
        extra: false,
        fields: [
          {
            name: "allowNetwork",
            required: true,
            default: false,
            schema: { type: "boolean" },
          },
          { name: "cwd", required: false, schema: { type: "string" } },
        ],
      }),
    ).toBe(
      `z.object({\n  "allowNetwork": z.boolean().default(false),\n  "cwd": z.string().optional()\n})`,
    );
  });

  it("matches union options without coercing", () => {
    const options = [
      { type: "array" as const, items: { type: "string" as const } },
      { type: "null" as const },
      { type: "literal" as const, value: "**" },
    ];
    expect(matchUnionOption("**", options)).toEqual({ type: "literal", value: "**" });
    expect(matchUnionOption(null, options)).toEqual({ type: "null" });
    expect(matchUnionOption(["src"], options)).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(valueMatchesJsonType(3, { type: "array", items: { type: "string" } })).toBe(false);
  });
});

describe("parseJsonText / stringifyJsonValue", () => {
  it("round-trips a nested object", () => {
    const text = stringifyJsonValue(nested);
    const parsed = parseJsonText(text);
    expect(parsed.isOk).toBe(true);
    if (parsed.isOk) {
      expect(parsed.value).toEqual(nested);
    }
  });

  it("treats empty text as unset rather than inventing a value", () => {
    expect(parseJsonText("")).toEqual({ value: undefined, isOk: true, isErr: false });
    expect(parseJsonText("   ")).toEqual({ value: undefined, isOk: true, isErr: false });
  });

  it("returns an error for invalid JSON and does not coerce", () => {
    const parsed = parseJsonText("{allowWrite:}");
    expect(parsed.isErr).toBe(true);
    if (parsed.isOk) {
      throw new Error("expected parseJsonText to fail");
    }
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("accepts JSON null, primitives, and arrays", () => {
    expect(parseJsonText("null")).toEqual({ value: null, isOk: true, isErr: false });
    expect(parseJsonText('"sandbox"')).toEqual({ value: "sandbox", isOk: true, isErr: false });
    expect(parseJsonText("3")).toEqual({ value: 3, isOk: true, isErr: false });
    expect(parseJsonText("false")).toEqual({ value: false, isOk: true, isErr: false });
    expect(parseJsonText("[1, true]")).toEqual({ value: [1, true], isOk: true, isErr: false });
  });

  it("rejects non-JSON values", () => {
    expect(asJsonValue(undefined).isErr).toBe(true);
    expect(asJsonValue(() => 1).isErr).toBe(true);
    expect(asJsonValue(Number.POSITIVE_INFINITY).isErr).toBe(true);
  });
});

describe("jsonTextError / toolProviderContextJsonError", () => {
  it("rejects invalid raw JSON before a save", () => {
    expect(jsonTextError("{allowWrite:}")).not.toBeNull();
    expect(jsonTextError('["src"]', { type: "array", items: { type: "string" } })).toBeNull();
    expect(jsonTextError("3", { type: "array", items: { type: "string" } })).toBe(
      "Value does not match string[]",
    );
    expect(jsonTextError("")).toBeNull();
  });

  it("names the invalid field on a tool-context form", () => {
    expect(
      toolProviderContextJsonError({
        fields: [
          {
            name: "allowWrite",
            kind: "json",
            required: false,
            jsonType: { type: "array", items: { type: "string" } },
          },
        ],
        values: { allowWrite: "{not json" },
        rawJson: "",
      }),
    ).toMatch(/^allowWrite must be valid JSON:/);
    expect(
      toolProviderContextJsonError({
        fields: [],
        values: {},
        rawJson: "{not json",
      }),
    ).toMatch(/^toolProviderContext must be valid JSON:/);
    expect(
      toolProviderContextJsonError({
        fields: [
          {
            name: "allowWrite",
            kind: "json",
            required: false,
            jsonType: { type: "array", items: { type: "string" } },
          },
        ],
        values: {},
        rawJson: '{"allowWrite":[1]}',
        source: "json",
      }),
    ).toMatch(/does not match object/);
  });
});

describe("immutable path edits", () => {
  it("sets, inserts, and removes nested array items without mutating the original", () => {
    const original = structuredClone(nested);
    const withItem = insertArrayItem(nested, ["allowWrite"], "notes");
    expect(withItem).toEqual({
      allowWrite: ["src", "tmp", "notes"],
      flags: { dryRun: true, retries: 2 },
    });
    expect(nested).toEqual(original);

    const replaced = setAtPath(withItem, ["allowWrite", 0], "apps");
    expect(getAtPath(replaced, ["allowWrite", 0])).toBe("apps");

    const removed = removeAtPath(replaced, ["allowWrite", 1]);
    expect(removed).toEqual({
      allowWrite: ["apps", "notes"],
      flags: { dryRun: true, retries: 2 },
    });
    expect(nested).toEqual(original);
  });

  it("round-trips edits through stringify and parse", () => {
    const edited = insertArrayItem(nested, ["allowWrite"], "notes");
    expect(parseJsonText(stringifyJsonValue(edited))).toEqual({
      value: edited,
      isOk: true,
      isErr: false,
    });
  });

  it("adds and renames object keys in place", () => {
    const added = addObjectKey(nested, ["flags"], "verbose", false);
    expect(added.isOk).toBe(true);
    if (!added.isOk) {
      throw new Error("expected addObjectKey to succeed");
    }
    expect(added.value).toEqual({
      allowWrite: ["src", "tmp"],
      flags: { dryRun: true, retries: 2, verbose: false },
    });

    const renamed = renameObjectKey(added.value, ["flags"], "dryRun", "preview");
    expect(renamed.isOk).toBe(true);
    if (!renamed.isOk) {
      throw new Error("expected renameObjectKey to succeed");
    }
    expect(Object.keys((renamed.value as { flags: Record<string, unknown> }).flags)).toEqual([
      "preview",
      "retries",
      "verbose",
    ]);
  });

  it("fails closed on empty or duplicate object keys", () => {
    expect(addObjectKey(nested, [], "", "x")).toEqual({
      error: "Key cannot be empty",
      isErr: true,
      isOk: false,
    });
    expect(addObjectKey(nested, [], "allowWrite", [])).toEqual({
      error: 'Key "allowWrite" already exists',
      isErr: true,
      isOk: false,
    });
    expect(renameObjectKey(nested, ["flags"], "dryRun", "")).toEqual({
      error: "Key cannot be empty",
      isErr: true,
      isOk: false,
    });
    expect(renameObjectKey(nested, ["flags"], "dryRun", "retries")).toEqual({
      error: 'Key "retries" already exists',
      isErr: true,
      isOk: false,
    });
  });

  it("throws when a path does not match the tree", () => {
    expect(() => getAtPath(nested, ["missing"])).toThrow(/expected object key/);
    expect(() => insertArrayItem(nested, ["flags"], "x")).toThrow(/expected an array/);
    expect(() => removeAtPath(nested, [])).toThrow(/cannot remove the root/);
  });
});
