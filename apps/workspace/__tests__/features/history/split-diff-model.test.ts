import assert from "node:assert/strict";
import test from "node:test";
import { diffMarkdown, type DiffLine } from "../../../src/features/history/diff-model";
import { isDiffLayout, splitRows } from "../../../src/features/history/split-diff-model";

function text(line: DiffLine | null): string | null {
  return line === null ? null : line.segments.map((segment) => segment.text).join("");
}

function lines(before: string, after: string): DiffLine[] {
  return diffMarkdown(before, after).hunks.flatMap((hunk) => [...hunk.lines]);
}

test("splitRows places context lines on both sides", () => {
  const rows = splitRows(lines("one\ntwo\nthree\n", "one\ntwo\nthree!\n"));

  assert.equal(rows.length, 3);
  assert.deepEqual([text(rows[0].before), text(rows[0].after)], ["one", "one"]);
  assert.equal(rows[0].before, rows[0].after);
});

test("splitRows pairs a removed line with its replacement", () => {
  const rows = splitRows(lines("one\ntwo\nthree\n", "one\ntwo\nthree!\n"));
  const changed = rows[2];

  assert.equal(changed.before?.kind, "removed");
  assert.equal(changed.after?.kind, "added");
  assert.deepEqual([text(changed.before), text(changed.after)], ["three", "three!"]);
});

test("splitRows leaves an empty cell for surplus removed lines", () => {
  const rows = splitRows(lines("a\nb\nc\nd\n", "a\nx\nd\n"));
  const changed = rows.filter((row) => row.before?.kind !== "context");

  assert.equal(changed.length, 2);
  assert.deepEqual([text(changed[0].before), text(changed[0].after)], ["b", "x"]);
  assert.deepEqual([text(changed[1].before), changed[1].after], ["c", null]);
});

test("splitRows leaves an empty cell for pure insertions", () => {
  const rows = splitRows(lines("a\nd\n", "a\nb\nc\nd\n"));
  const inserted = rows.filter((row) => row.before === null);

  assert.deepEqual(
    inserted.map((row) => text(row.after)),
    ["b", "c"],
  );
  assert.ok(inserted.every((row) => row.after?.kind === "added"));
});

test("splitRows pairs in order even when the model emits surplus removals after additions", () => {
  const removedA: DiffLine = {
    key: "r1",
    kind: "removed",
    beforeLine: 1,
    afterLine: null,
    segments: [{ text: "A", changed: false }],
  };
  const addedB: DiffLine = {
    key: "a1",
    kind: "added",
    beforeLine: null,
    afterLine: 1,
    segments: [{ text: "B", changed: false }],
  };
  const removedC: DiffLine = {
    key: "r2",
    kind: "removed",
    beforeLine: 2,
    afterLine: null,
    segments: [{ text: "C", changed: false }],
  };

  const rows = splitRows([removedA, addedB, removedC]);

  assert.deepEqual(
    rows.map((row) => [text(row.before), text(row.after)]),
    [
      ["A", "B"],
      ["C", null],
    ],
  );
});

test("splitRows keys are unique across a hunk", () => {
  const rows = splitRows(lines("a\nb\nc\nd\n", "a\nx\ny\nz\nd\n"));
  const keys = new Set(rows.map((row) => row.key));

  assert.equal(keys.size, rows.length);
});

test("isDiffLayout accepts only the two layouts", () => {
  assert.equal(isDiffLayout("split"), true);
  assert.equal(isDiffLayout("unified"), true);
  assert.equal(isDiffLayout("side-by-side"), false);
  assert.equal(isDiffLayout(undefined), false);
});
