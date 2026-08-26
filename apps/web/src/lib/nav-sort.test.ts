import { describe, expect, it } from "bun:test";

import { latestTimestampById, sortByLastUsedThenAlpha } from "./nav-sort";

describe("latestTimestampById", () => {
  it("keeps the latest timestamp per id", () => {
    const lastUsed = latestTimestampById(
      [
        { id: "writer", at: "2026-01-01T00:00:00.000Z" },
        { id: "editor", at: "2026-03-01T00:00:00.000Z" },
        { id: "writer", at: "2026-02-01T00:00:00.000Z" },
      ],
      (item) => item.id,
      (item) => item.at,
    );

    expect(lastUsed.get("writer")).toBe("2026-02-01T00:00:00.000Z");
    expect(lastUsed.get("editor")).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("sortByLastUsedThenAlpha", () => {
  it("orders by last used descending, then alphabetically", () => {
    const lastUsed = new Map([
      ["write-article", "2026-02-01T00:00:00.000Z"],
      ["demo-counter", "2026-03-01T00:00:00.000Z"],
    ]);

    expect(
      sortByLastUsedThenAlpha(
        ["literature-review", "write-article", "answer-question", "demo-counter"],
        lastUsed,
      ),
    ).toEqual(["demo-counter", "write-article", "answer-question", "literature-review"]);
  });

  it("breaks timestamp ties alphabetically", () => {
    const lastUsed = new Map([
      ["writer", "2026-02-01T00:00:00.000Z"],
      ["editor", "2026-02-01T00:00:00.000Z"],
    ]);

    expect(sortByLastUsedThenAlpha(["writer", "editor", "critic"], lastUsed)).toEqual([
      "editor",
      "writer",
      "critic",
    ]);
  });

  it("sorts unused ids alphabetically", () => {
    expect(sortByLastUsedThenAlpha(["writer", "critic", "editor"], new Map())).toEqual([
      "critic",
      "editor",
      "writer",
    ]);
  });
});
