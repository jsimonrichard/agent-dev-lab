import { describe, expect, it } from "bun:test";

import { AdlError } from "../errors";
import { serializeError } from "./serialize-error";

describe("serializeError", () => {
  it("includes name, message, stack, and extra enumerable fields", () => {
    const error = Object.assign(new Error("no key"), {
      code: "unauthorized",
      statusCode: 401,
      url: "https://api.openai.com",
    });
    expect(serializeError(error)).toEqual({
      name: "Error",
      message: "no key",
      stack: error.stack,
      code: "unauthorized",
      statusCode: 401,
      url: "https://api.openai.com",
    });
  });

  it("includes model text from structured-output failures", () => {
    const error = Object.assign(new Error("No object generated: could not parse the response."), {
      name: "AI_NoObjectGeneratedError",
      text: "**summary**: format! is unsupported",
    });
    const serialized = serializeError(error) as Record<string, unknown>;
    expect(serialized.text).toBe("**summary**: format! is unsupported");
    expect(serialized.message).toBe("No object generated: could not parse the response.");
  });

  it("includes AdlError codes", () => {
    const error = new AdlError("INVALID_INPUT", "bad input");
    const serialized = serializeError(error) as Record<string, unknown>;
    expect(serialized.code).toBe("INVALID_INPUT");
    expect(serialized.message).toBe("bad input");
  });
});
