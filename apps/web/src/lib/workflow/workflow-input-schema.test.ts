import { describe, expect, it } from "bun:test";
import { z } from "zod";

import {
  buildWorkflowInput,
  describeWorkflowInput,
  sampleWorkflowInput,
  workflowInputValuesFromSample,
} from "./workflow-input-schema";

function zodString() {
  return { _def: { typeName: "ZodString" } };
}

function zodNumber() {
  return { _def: { typeName: "ZodNumber" } };
}

function zodOptional(inner: unknown) {
  return { _def: { typeName: "ZodOptional", innerType: inner } };
}

function zodDefault(inner: unknown, value = "") {
  return { _def: { typeName: "ZodDefault", innerType: inner, defaultValue: () => value } };
}

function zodObject(shape: Record<string, unknown>) {
  return {
    _def: {
      typeName: "ZodObject",
      shape: () => shape,
    },
    shape,
  };
}

describe("describeWorkflowInput", () => {
  it("extracts required string fields from a Zod object", () => {
    const schema = zodObject({
      topic: zodString(),
    });
    expect(describeWorkflowInput(schema)).toEqual([
      { name: "topic", kind: "string", required: true, description: undefined, options: undefined },
    ]);
  });

  it("marks optional and defaulted fields as not required", () => {
    const schema = zodObject({
      steps: zodOptional(zodNumber()),
      name: zodDefault(zodString()),
    });
    expect(describeWorkflowInput(schema)).toEqual([
      {
        name: "steps",
        kind: "number",
        required: false,
        description: undefined,
        options: undefined,
      },
      { name: "name", kind: "string", required: false, description: undefined, options: undefined },
    ]);
  });

  it("describes array and union fields with nested jsonType", () => {
    const schema = z.object({
      allowWrite: z.array(z.string()),
      allowRead: z.union([z.array(z.string()), z.null(), z.literal("**")]),
      allowEnv: z.union([z.literal(true), z.array(z.union([z.string(), z.instanceof(RegExp)]))]),
    });
    expect(describeWorkflowInput(schema)).toEqual([
      {
        name: "allowWrite",
        kind: "json",
        required: true,
        description: undefined,
        options: undefined,
        jsonType: { type: "array", items: { type: "string" } },
      },
      {
        name: "allowRead",
        kind: "json",
        required: true,
        description: undefined,
        options: undefined,
        jsonType: {
          type: "union",
          options: [
            { type: "array", items: { type: "string" } },
            { type: "null" },
            { type: "literal", value: "**" },
          ],
        },
      },
      {
        name: "allowEnv",
        kind: "json",
        required: true,
        description: undefined,
        options: undefined,
        jsonType: {
          type: "union",
          options: [
            { type: "literal", value: true },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
    ]);
  });

  it("walks nested object jsonType fields", () => {
    const schema = z.object({
      sandbox: z
        .object({
          cwd: z.string(),
          allowWrite: z.array(z.string()),
        })
        .partial(),
    });
    expect(describeWorkflowInput(schema)).toEqual([
      {
        name: "sandbox",
        kind: "json",
        required: true,
        description: undefined,
        options: undefined,
        jsonType: {
          type: "object",
          extra: false,
          fields: [
            { name: "cwd", required: false, schema: { type: "string" } },
            {
              name: "allowWrite",
              required: false,
              schema: { type: "array", items: { type: "string" } },
            },
          ],
        },
      },
    ]);
  });

  it("returns no fields when the workflow has no object schema", () => {
    expect(describeWorkflowInput(undefined)).toEqual([]);
    expect(describeWorkflowInput(zodString())).toEqual([]);
  });
});

describe("sampleWorkflowInput", () => {
  it("applies defaults via the schema safeParse path", () => {
    const schema = z.object({
      question: z.string().default("What is ADL?"),
      retries: z.number().default(3),
    });
    expect(sampleWorkflowInput(schema)).toEqual({
      question: "What is ADL?",
      retries: 3,
    });
  });

  it("does not invent values for optional fields without Zod defaults", () => {
    const schema = z
      .object({
        allowNetwork: z.boolean(),
        allowWrite: z.array(z.string()),
      })
      .partial();
    expect(sampleWorkflowInput(schema)).toEqual({});
  });

  it("maps a sample object into start-run form values", () => {
    expect(
      workflowInputValuesFromSample(
        [
          { name: "question", kind: "string", required: false },
          { name: "retries", kind: "number", required: false },
        ],
        { question: "Hello", retries: 2 },
      ),
    ).toEqual({ question: "Hello", retries: "2" });
  });
});

describe("buildWorkflowInput", () => {
  it("builds an object from field values", () => {
    expect(
      buildWorkflowInput([{ name: "topic", kind: "string", required: true }], {
        topic: "CRISPR delivery",
      }),
    ).toEqual({ topic: "CRISPR delivery" });
  });

  it("rejects missing required fields", () => {
    expect(() =>
      buildWorkflowInput([{ name: "topic", kind: "string", required: true }], { topic: "" }),
    ).toThrow("topic is required");
  });

  it("omits unset optional booleans instead of coercing them to false", () => {
    expect(
      buildWorkflowInput(
        [
          { name: "allowNetwork", kind: "boolean", required: false },
          { name: "allowWrite", kind: "json", required: false },
        ],
        {},
      ),
    ).toEqual({});
  });

  it("includes an explicit false optional boolean", () => {
    expect(
      buildWorkflowInput([{ name: "allowNetwork", kind: "boolean", required: false }], {
        allowNetwork: false,
      }),
    ).toEqual({ allowNetwork: false });
  });

  it("rejects a missing required boolean", () => {
    expect(() =>
      buildWorkflowInput([{ name: "flag", kind: "boolean", required: true }], {}),
    ).toThrow("flag is required");
  });

  it("returns an empty object when the workflow has no input fields", () => {
    expect(buildWorkflowInput([], {})).toEqual({});
  });
});
