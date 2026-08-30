import assert from "node:assert/strict";
import test from "node:test";
import { diffMarkdown, type DiffLine } from "../../../src/features/history/diff-model";
import { diffWords } from "../../../src/shared/lib/word-diff";

function flatten(markdownDiff: ReturnType<typeof diffMarkdown>): DiffLine[] {
  return markdownDiff.hunks.flatMap((hunk) => [...hunk.lines]);
}

function text(line: DiffLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

test("diffMarkdown reports no hunks for identical documents", () => {
  const diff = diffMarkdown("# Title\n\nHello world.\n", "# Title\n\nHello world.\n");

  assert.deepEqual(diff.hunks, []);
  assert.deepEqual(diff.stats, { added: 0, removed: 0 });
});

test("diffMarkdown ignores trailing newline differences", () => {
  const diff = diffMarkdown("Hello", "Hello\n\n");

  assert.deepEqual(diff.stats, { added: 0, removed: 0 });
});

test("diffMarkdown counts added and removed lines", () => {
  const diff = diffMarkdown("one\ntwo\n", "one\ntwo\nthree\n");

  assert.deepEqual(diff.stats, { added: 1, removed: 0 });
  const added = flatten(diff).filter((line) => line.kind === "added");
  assert.deepEqual(added.map(text), ["three"]);
});

test("diffMarkdown pairs a replaced line as one removal and one addition", () => {
  const diff = diffMarkdown("one\ntwo\n", "one\ntwo point five\n");

  assert.deepEqual(diff.stats, { added: 1, removed: 1 });
  const kinds = flatten(diff).map((line) => line.kind);
  assert.deepEqual(kinds, ["context", "removed", "added"]);
});

test("diffMarkdown numbers lines against each side independently", () => {
  const diff = diffMarkdown("one\ntwo\n", "one\nchanged\nthree\n");
  const lines = flatten(diff);

  const removed = lines.find((line) => line.kind === "removed");
  const firstAdded = lines.find((line) => line.kind === "added");
  assert.equal(removed?.beforeLine, 2);
  assert.equal(removed?.afterLine, null);
  assert.equal(firstAdded?.beforeLine, null);
  assert.equal(firstAdded?.afterLine, 2);
});

test("diffMarkdown keeps bounded context and carries the hidden lines", () => {
  const before = Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n");
  const after = before.replace("line 20", "line twenty");

  const diff = diffMarkdown(before, after);

  assert.equal(diff.hunks.length, 1);
  const hunk = diff.hunks[0];
  assert.ok(hunk);
  assert.equal(hunk.hiddenBefore.length, 17);
  assert.ok(hunk.hiddenBefore.every((line) => line.kind === "context"));
  assert.equal(hunk.hiddenBefore[0]?.beforeLine, 1);
  assert.equal(hunk.lines.length, 8);
});

test("diffMarkdown groups distant changes into separate hunks", () => {
  const before = Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n");
  const after = before.replace("line 2", "line two").replace("line 30", "line thirty");

  const diff = diffMarkdown(before, after);

  assert.equal(diff.hunks.length, 2);
});

test("diffMarkdown marks only the changed words in a replaced line", () => {
  const diff = diffMarkdown("the quick brown fox\n", "the quick red fox\n");
  const lines = flatten(diff);

  const removed = lines.find((line) => line.kind === "removed");
  const added = lines.find((line) => line.kind === "added");
  assert.deepEqual(
    removed?.segments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["brown"],
  );
  assert.deepEqual(
    added?.segments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["red"],
  );
});

test("diffMarkdown leaves unrelated replaced lines whole instead of word-matching noise", () => {
  const diff = diffMarkdown("alpha beta gamma\n", "nothing alike here\n");
  const lines = flatten(diff);

  const added = lines.find((line) => line.kind === "added");
  assert.deepEqual(added?.segments, [{ text: "nothing alike here", changed: true }]);
});

test("diffMarkdown treats an empty document as a full removal", () => {
  const diff = diffMarkdown("one\ntwo\n", "");

  assert.deepEqual(diff.stats, { added: 0, removed: 2 });
});

test("diffMarkdown pairs a replaced line with its best match when a line is inserted above it", () => {
  const diff = diffMarkdown(
    "alpha\nThe quick brown fox jumps\nomega\n",
    "alpha\nA new opening line\nThe quick brown fox leaps\nomega\n",
  );
  const lines = flatten(diff);

  assert.deepEqual(
    lines.map((line) => line.kind),
    ["context", "added", "removed", "added", "context"],
  );
  const removed = lines.find((line) => line.kind === "removed");
  assert.deepEqual(
    removed?.segments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["jumps"],
  );
  const pairedAdded = lines[3];
  assert.deepEqual(
    pairedAdded?.segments.filter((segment) => segment.changed).map((segment) => segment.text),
    ["leaps"],
  );
  const insertedAdded = lines[1];
  assert.deepEqual(insertedAdded?.segments, [{ text: "A new opening line", changed: false }]);
});

test("diffMarkdown anchors an inserted blank line to the content above it", () => {
  const diff = diffMarkdown("para one\n\nnext\n", "para one\n\n\nnext\n");
  const lines = flatten(diff);

  assert.deepEqual(
    lines.map((line) => line.kind),
    ["context", "added", "context", "context"],
  );
  const added = lines.find((line) => line.kind === "added");
  assert.equal(added?.afterLine, 2);
});

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
