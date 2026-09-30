import assert from "node:assert/strict";
import { test } from "vitest";
import { noteReplacementDiff } from "@/features/ai/actions/editor-action-model";

const NOTE = ["# Superscript", "", "Small raised characters.", "", "`¹`", "", "`²`"].join("\n");

test("a whole-note edit is reviewed as the lines it changes", () => {
  const result = NOTE.replace("`¹`", "```\n¹\n```");
  const diff = noteReplacementDiff(NOTE, result);

  assert.notEqual(diff, null);
  assert.deepEqual(diff?.stats, { added: 3, removed: 1 });
  const removed = diff?.hunks.flatMap((hunk) =>
    hunk.lines.filter((line) => line.kind === "removed"),
  );
  assert.deepEqual(
    removed?.map((line) => line.segments.map((segment) => segment.text).join("")),
    ["`¹`"],
  );
});

test("a result that drops a line shows the loss", () => {
  const diff = noteReplacementDiff(NOTE, NOTE.replace("\n\nSmall raised characters.", ""));

  assert.equal(diff?.stats.removed, 2);
  assert.equal(diff?.stats.added, 0);
});

test("an unchanged result is an empty diff, not a rewrite", () => {
  assert.deepEqual(noteReplacementDiff(NOTE, NOTE)?.hunks, []);
});

test("a result that keeps no written line is shown as itself", () => {
  assert.equal(noteReplacementDiff(NOTE, "A short summary.\n\nOf superscripts."), null);
});
