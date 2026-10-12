import { expect, it } from "bun:test";

import { mapConcurrent } from "./concurrent.js";

it("bounds active work on a large input and preserves its order", async () => {
  let active = 0;
  let peak = 0;
  const input = Array.from({ length: 10_000 }, (_, i) => i);
  const result = await mapConcurrent(
    input,
    async (i) => {
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      return i;
    },
    16,
  );
  expect(peak).toBe(16);
  expect(result).toEqual(input);
});

it("drains started operations and stops scheduling when a worker fails", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started: number[] = [];
  let drained = false;
  const operation = mapConcurrent(
    [0, 1, 2, 3],
    async (i) => {
      started.push(i);
      if (i === 0) throw new Error("failed");
      await gate;
      drained = true;
    },
    2,
  );
  await Promise.resolve();
  expect(drained).toBe(false);
  release();
  await expect(operation).rejects.toThrow("failed");
  expect(drained).toBe(true);
  expect(started).toEqual([0, 1]);
});
