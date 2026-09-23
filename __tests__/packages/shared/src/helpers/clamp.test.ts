import { expect, test } from "vitest";
import { clamp } from "@skriuw/shared/helpers/clamp";

test.each([
  [-1, 0, 1, 0],
  [2, 0, 1, 1],
  [0.25, 0, 1, 0.25],
  [0, 0, 1, 0],
  [1, 0, 1, 1],
  [-3, -5, -2, -3],
  [8, 2, 2, 2],
  [Infinity, 0, 1, 1],
  [-Infinity, 0, 1, 0],
])("clamp(%s, %s, %s) returns %s", (value, minimum, maximum, expected) => {
  expect(clamp(value, minimum, maximum)).toBe(expected);
});

test("NaN propagates from any argument", () => {
  expect(clamp(NaN, 0, 1)).toBeNaN();
  expect(clamp(0, NaN, 1)).toBeNaN();
  expect(clamp(0, 0, NaN)).toBeNaN();
});
