import assert from "node:assert/strict";
import { test } from "vitest";
import { fuzzyMatchScore } from "@/shared/lib/fuzzy-match";

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
  const boundaries = fuzzyMatchScore("ost", "Open Settings Theme");
  const consecutive = fuzzyMatchScore("opn", "Open Settings Theme");
  const scattered = fuzzyMatchScore("pet", "Open Settings Theme");
  assert.ok(boundaries !== null && consecutive !== null && scattered !== null);
  assert.ok(boundaries > scattered);
  assert.ok(consecutive > scattered);
});

test("handles various word boundary delimiters", () => {
  const inWord = fuzzyMatchScore("b", "ab");
  assert.ok(inWord !== null);
  for (const text of ["a b", "a-b", "a_b", "a/b", "a.b", "a:b"]) {
    const score = fuzzyMatchScore("b", text);
    assert.ok(score !== null && score > inWord, `${text} does not treat b as a word start`);
  }
});
