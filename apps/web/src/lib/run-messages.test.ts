import { describe, expect, it } from "bun:test";

import { overlayNewerThanPrefetch } from "./run-messages";

describe("overlayNewerThanPrefetch", () => {
  const older = [{ id: "old", role: "user" as const, content: "old" }];
  const newer = [{ id: "new", role: "user" as const, content: "new" }];

  it("drops overlay transcripts that are not newer than the prefetch", () => {
    expect(overlayNewerThanPrefetch({ scope: older }, { scope: 4 }, 10)).toEqual({});
  });

  it("keeps live transcripts fetched after the prefetch snapshot", () => {
    expect(overlayNewerThanPrefetch({ scope: newer }, { scope: 12 }, 10)).toEqual({ scope: newer });
  });
});
