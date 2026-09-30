import { expect, test } from "vitest";
import {
  registerBlockReveal,
  requestBlockReveal,
  requestRangeReveal,
  takePendingBlockReveal,
  takePendingRangeReveal,
} from "@/features/editor/reveal-controller";

const request = { noteId: "a", blockIndex: 2, from: 3, to: 8, text: "Alpha" };

test("a range reveal waits for its note and is served once", () => {
  let calls = 0;
  const unregister = registerBlockReveal(() => {
    calls += 1;
  });
  requestRangeReveal(request);
  expect(calls).toBe(1);
  expect(takePendingRangeReveal("b")).toBeNull();
  expect(takePendingRangeReveal("a")).toEqual(request);
  expect(takePendingRangeReveal("a")).toBeNull();
  unregister();
});

test("the latest reveal request replaces an earlier one of the other kind", () => {
  requestRangeReveal(request);
  requestBlockReveal("a", "block-1");
  expect(takePendingRangeReveal("a")).toBeNull();
  expect(takePendingBlockReveal("a")).toBe("block-1");
  requestBlockReveal("a", "block-2");
  requestRangeReveal(request);
  expect(takePendingBlockReveal("a")).toBeNull();
  expect(takePendingRangeReveal("a")).toEqual(request);
});
