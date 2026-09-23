import assert from "node:assert/strict";
import { test } from "vitest";
import { diffWords } from "@/shared/lib/word-diff";

test("diffWords returns whole-line segments when the lines barely overlap", () => {
  const words = diffWords("completely different text", "another sentence entirely");

  assert.deepEqual(words.before, [{ text: "completely different text", changed: true }]);
  assert.deepEqual(words.after, [{ text: "another sentence entirely", changed: true }]);
});

test("diffWords merges adjacent segments of the same kind", () => {
  const words = diffWords("keep this part", "keep that part");

  assert.deepEqual(
    words.after.map((segment) => segment.text),
    ["keep ", "that", " part"],
  );
});

test("diffWords absorbs a one-character gap between two changed words into one span", () => {
  const words = diffWords("start alpha beta tail one two", "start gamma delta tail one two");

  assert.deepEqual(words.before, [
    { text: "start ", changed: false },
    { text: "alpha beta", changed: true },
    { text: " tail one two", changed: false },
  ]);
  assert.deepEqual(words.after, [
    { text: "start ", changed: false },
    { text: "gamma delta", changed: true },
    { text: " tail one two", changed: false },
  ]);
});
