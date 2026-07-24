import assert from "node:assert/strict";
import test from "node:test";
import { fuzzyMatchScore } from "../../../src/shared/lib/fuzzy-match";

test("returns 0 for empty query", () => {
  assert.equal(fuzzyMatchScore("", "some text"), 0);
});

test("returns null for empty text when query is non-empty", () => {
  assert.equal(fuzzyMatchScore("abc", ""), null);
});

test("returns null when query is not a subsequence", () => {
  assert.equal(fuzzyMatchScore("xyz", "hello world"), null);
});

test("scores exact and substring matches higher with word boundary bonus", () => {
  const boundaryScore = fuzzyMatchScore("set", "Open Settings");
  const nonBoundaryScore = fuzzyMatchScore("ett", "Open Settings");
  assert.ok(boundaryScore !== null);
  assert.ok(nonBoundaryScore !== null);
  assert.ok(boundaryScore > nonBoundaryScore);
});

test("scores fuzzy subsequence matches with word boundary and consecutive bonuses", () => {
  const score = fuzzyMatchScore("ost", "Open Settings Theme");
  assert.ok(score !== null);
  assert.ok(score > 0);
});

test("handles various word boundary delimiters", () => {
  assert.ok(fuzzyMatchScore("b", "a-b") !== null);
  assert.ok(fuzzyMatchScore("b", "a_b") !== null);
  assert.ok(fuzzyMatchScore("b", "a/b") !== null);
  assert.ok(fuzzyMatchScore("b", "a.b") !== null);
  assert.ok(fuzzyMatchScore("b", "a:b") !== null);
});
