import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceAnnotation } from "../../../src/contracts/workspace";
import {
  anchoredThreadIds,
  threadsForNote,
} from "../../../src/features/note-chrome/annotation-list";

function thread(
  id: string,
  noteId: string,
  createdAt: number,
): WorkspaceAnnotation {
  return {
    id,
    noteId,
    status: "open",
    anchorText: id,
    createdAt,
    resolvedAt: null,
    comments: [],
  };
}

test("anchored ids come from the saved markdown, not the rendered window", () => {
  const markdown = [
    "The claim <mark data-skriuw-annotation=\"thread-a\">needs a source</mark> here.",
    "Later <mark data-skriuw-annotation='thread-b'>another anchor</mark> appears.",
  ].join("\n\n");

  assert.deepEqual([...anchoredThreadIds(markdown)].sort(), ["thread-a", "thread-b"]);
});

test("a thread whose anchor is gone reads as unanchored", () => {
  const anchored = anchoredThreadIds("Nothing is marked up in this note.");

  assert.equal(anchored.has("thread-a"), false);
});

test("a highlight tag is never mistaken for an anchor", () => {
  const anchored = anchoredThreadIds('<mark data-skriuw-highlight="blue">Marked</mark>');

  assert.equal(anchored.size, 0);
});

test("threads are listed per note in creation order", () => {
  const annotations = new Map<string, WorkspaceAnnotation>([
    ["late", thread("late", "note-1", 30)],
    ["other", thread("other", "note-2", 20)],
    ["early", thread("early", "note-1", 10)],
  ]);

  assert.deepEqual(
    threadsForNote(annotations, "note-1").map((entry) => entry.id),
    ["early", "late"],
  );
});
