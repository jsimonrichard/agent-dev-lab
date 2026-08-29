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

  it("returns an empty object when the workflow has no input fields", () => {
    expect(buildWorkflowInput([], {})).toEqual({});
  });
});
