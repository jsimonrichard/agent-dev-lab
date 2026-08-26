import { describe, expect, it } from "bun:test";

import { clampEventLogPage, eventLogPageWindow } from "./event-log-page";

describe("eventLogPageWindow", () => {
  it("returns an empty window for no items", () => {
    expect(eventLogPageWindow([], 0, 50)).toEqual({
      page: 0,
      totalPages: 1,
      slice: [],
      from: 0,
      to: 0,
      total: 0,
    });
  });

  it("puts the newest events on page 0, newest first", () => {
    const items = [1, 2, 3, 4, 5];
    expect(eventLogPageWindow(items, 0, 2).slice).toEqual([5, 4]);
    expect(eventLogPageWindow(items, 1, 2).slice).toEqual([3, 2]);
    expect(eventLogPageWindow(items, 2, 2).slice).toEqual([1]);
    expect(eventLogPageWindow(items, 0, 2)).toMatchObject({
      page: 0,
      totalPages: 3,
      from: 1,
      to: 2,
      total: 5,
    });
    expect(eventLogPageWindow(items, 2, 2)).toMatchObject({
      page: 2,
      totalPages: 3,
      from: 5,
      to: 5,
      total: 5,
    });
  });

  it("clamps an out-of-range page to the last page", () => {
    expect(clampEventLogPage(99, 5, 2)).toBe(2);
    expect(eventLogPageWindow([1, 2, 3], 40, 2).page).toBe(1);
  });
});
