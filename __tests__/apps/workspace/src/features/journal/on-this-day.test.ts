import assert from "node:assert/strict";
import { test } from "vitest";
import type { JournalEntry } from "@/features/journal/model";
import { entryExcerpt, onThisDay } from "@/features/journal/on-this-day";

function entry(dateKey: string): JournalEntry {
  return {
    noteId: `note-${dateKey}`,
    dateKey,
    title: "Untitled",
    mood: null,
    wordCount: 4,
    tagIds: [],
  };
}

test("onThisDay lists a week, a month, and whole years back, nearest first", () => {
  const entries = [
    "2026-09-17",
    "2026-09-10",
    "2026-08-17",
    "2025-09-17",
    "2023-09-17",
    "2027-09-17",
    "2025-09-16",
  ].map(entry);
  assert.deepEqual(
    onThisDay(entries, "2026-09-17").map((memory) => [memory.label, memory.entry.dateKey]),
    [
      ["A week ago", "2026-09-10"],
      ["A month ago", "2026-08-17"],
      ["A year ago", "2025-09-17"],
      ["3 years ago", "2023-09-17"],
    ],
  );
});

test("a month ago is skipped when the shorter month clamps the day", () => {
  const entries = [entry("2026-02-28")];
  assert.deepEqual(onThisDay(entries, "2026-03-31"), []);
  assert.equal(onThisDay(entries, "2026-03-28")[0]?.label, "A month ago");
});

test("February 29 only recalls earlier leap days", () => {
  const entries = [entry("2024-02-29"), entry("2027-02-28")];
  assert.deepEqual(
    onThisDay(entries, "2028-02-29").map((memory) => [memory.label, memory.entry.dateKey]),
    [["4 years ago", "2024-02-29"]],
  );
});

test("entryExcerpt flattens Markdown structure into one bounded paragraph", () => {
  assert.equal(
    entryExcerpt(
      "# Tuesday\n\n## Focus\n\n- [x] ship the **journal**\n- read [the spec](docs/spec.md)\n\n```\ncode\n```\n> quiet `day`",
    ),
    "Focus ship the journal read the spec code quiet day",
  );
  const long = entryExcerpt(`${"word ".repeat(80)}`);
  assert.ok(long.length <= 161);
  assert.ok(long.endsWith("…"));
  assert.equal(entryExcerpt(""), "");
  assert.equal(
    entryExcerpt("# Monday\n\n## Focus\n\n- ...\n\n## Tasks\n\n- [ ] ...\n"),
    "Focus Tasks",
  );
});
