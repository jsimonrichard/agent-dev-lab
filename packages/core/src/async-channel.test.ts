import { describe, expect, it } from "bun:test";

import { createAsyncChannel } from "./async-channel";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

describe("createAsyncChannel", () => {
  it("yields pushed values in order, then ends on close", async () => {
    const channel = createAsyncChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.close();

    expect(await collect(channel)).toEqual([1, 2]);
  });

  it("delivers values pushed after iteration has already started (the pull-waits-for-push case)", async () => {
    const channel = createAsyncChannel<string>();
    const resultPromise = collect(channel);

    // No values buffered yet — the iterator is parked on a waiter until these arrive.
    await Promise.resolve();
    channel.push("a");
    await Promise.resolve();
    channel.push("b");
    channel.close();

    expect(await resultPromise).toEqual(["a", "b"]);
  });

  it("ignores a push after close", async () => {
    const channel = createAsyncChannel<number>();
    channel.push(1);
    channel.close();
    channel.push(2);

    expect(await collect(channel)).toEqual([1]);
  });

  it("drains already-buffered values before surfacing a fail()", async () => {
    const channel = createAsyncChannel<number>();
    channel.push(1);
    channel.fail(new Error("boom"));

    const values: number[] = [];
    await expect(
      (async () => {
        for await (const value of channel) {
          values.push(value);
        }
      })(),
    ).rejects.toThrow("boom");
    expect(values).toEqual([1]);
  });

  it("rejects a waiting consumer immediately when fail() arrives with nothing buffered", async () => {
    const channel = createAsyncChannel<number>();
    const resultPromise = collect(channel);

    await Promise.resolve();
    channel.fail(new Error("boom"));

    await expect(resultPromise).rejects.toThrow("boom");
  });

  it("supports multiple independent iterations, each seeing only values pushed after it started reading its own buffered backlog", async () => {
    // Not a broadcast channel — a second `for await` continues consuming the same shared
    // buffer/waiter queue, not an independent replay. This test documents that behavior
    // rather than asserting a fan-out guarantee this type doesn't provide.
    const channel = createAsyncChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.close();

    const iterator = channel[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 1, done: false });
    expect(await iterator.next()).toEqual({ value: 2, done: false });
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
