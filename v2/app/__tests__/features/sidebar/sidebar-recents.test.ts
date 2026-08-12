import assert from "node:assert/strict";
import test from "node:test";
import { compactAge, recentNotes } from "../../../src/features/sidebar/sidebar-recents";
import type { NoteMetadata } from "../../../src/store/types";

function meta(title: string, updatedAt: number): NoteMetadata {
  return { title, wordCount: 0, updatedAt };
}

test("recent notes are newest first, capped, and skip ids without metadata", () => {
  const metadata = new Map([
    ["a", meta("Oldest", 100)],
    ["b", meta("Middle", 200)],
    ["c", meta("Newest", 300)],
    ["d", meta("Second", 250)],
  ]);
  const recents = recentNotes(["a", "b", "c", "d", "ghost"], metadata, 3);
  assert.deepEqual(
    recents.map((note) => note.id),
    ["c", "d", "b"],
  );
  assert.equal(recents[0]?.title, "Newest");
  assert.deepEqual(recentNotes([], metadata), []);
});

test("compact age steps through terse units", () => {
  const now = 1_000_000_000_000;
  const minute = 60_000;
  assert.equal(compactAge(now, now), "now");
  assert.equal(compactAge(now - 5 * minute, now), "5m");
  assert.equal(compactAge(now - 3 * 60 * minute, now), "3h");
  assert.equal(compactAge(now - 2 * 24 * 60 * minute, now), "2d");
  assert.equal(compactAge(now - 10 * 24 * 60 * minute, now), "1w");
  assert.equal(compactAge(now - 90 * 24 * 60 * minute, now), "3mo");
  assert.equal(compactAge(now - 400 * 24 * 60 * minute, now), "1y");
  assert.equal(compactAge(now + minute, now), "now");
});
