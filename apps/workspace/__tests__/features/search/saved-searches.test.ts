import assert from "node:assert/strict";
import test from "node:test";
import { savedSearches } from "../../../src/features/search/saved-searches";
import { fixtureSettings } from "../references/fixtures";

test("saved queries preserve relationship syntax through serialization", () => {
  const queries = ['#"design system" $Ada planning', "\\#literal"];
  const settings = { ...fixtureSettings(), savedSearches: queries };
  assert.deepEqual(
    savedSearches(JSON.parse(JSON.stringify(settings))),
    queries,
  );
  assert.deepEqual(savedSearches(fixtureSettings()), []);
});

test("saved search preference rejects malformed and unbounded input", () => {
  for (const invalid of [
    null,
    "query",
    [42],
    [" "],
    ["x".repeat(513)],
    Array(101).fill("query"),
  ]) {
    assert.throws(
      () => savedSearches({ ...fixtureSettings(), savedSearches: invalid }),
      /invalid/,
    );
  }
});
