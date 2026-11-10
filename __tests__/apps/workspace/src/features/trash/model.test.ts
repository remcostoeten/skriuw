import assert from "node:assert/strict";
import { test } from "vitest";
import {
  groupTrashRows,
  summarizeTrashKinds,
  trashNeighborId,
  trashRowPreview,
} from "@/features/trash/model";
import type { TrashRow } from "@skriuw/renderer-core/store/trash";

const DAY = 86_400_000;
const START_OF_TODAY = new Date(2026, 10, 10).getTime();

function row(partial: Partial<TrashRow> & Pick<TrashRow, "id">): TrashRow {
  return {
    kind: "note",
    title: partial.id,
    deletedAt: START_OF_TODAY,
    location: null,
    summary: "Note",
    snippet: "",
    ...partial,
  };
}

test("date sorts group rows by age in arrival order", () => {
  const rows = [
    row({ id: "now", deletedAt: START_OF_TODAY + 60_000 }),
    row({ id: "midnight", deletedAt: START_OF_TODAY }),
    row({ id: "last-night", deletedAt: START_OF_TODAY - 1 }),
    row({ id: "five-days", deletedAt: START_OF_TODAY - 5 * DAY }),
    row({ id: "three-weeks", deletedAt: START_OF_TODAY - 21 * DAY, kind: "folder" }),
    row({ id: "last-year", deletedAt: START_OF_TODAY - 400 * DAY }),
  ];

  const groups = groupTrashRows(rows, "newest", START_OF_TODAY);

  assert.deepEqual(
    groups.map((group) => [group.id, group.title, group.rows.map((item) => item.id)]),
    [
      ["today", "Today", ["now", "midnight"]],
      ["yesterday", "Yesterday", ["last-night"]],
      ["week", "Last 7 days", ["five-days"]],
      ["month", "Last 30 days", ["three-weeks"]],
      ["older", "Older", ["last-year"]],
    ],
  );
  assert.equal(groups[0]?.hint, "2 notes");
  assert.equal(groups[3]?.hint, "1 folder");

  const oldestFirst = groupTrashRows([...rows].reverse(), "oldest", START_OF_TODAY);
  assert.deepEqual(
    oldestFirst.map((group) => group.id),
    ["older", "month", "week", "yesterday", "today"],
  );
});

test("title sorts keep one group and an empty list has none", () => {
  const rows = [row({ id: "a" }), row({ id: "b", deletedAt: START_OF_TODAY - 90 * DAY })];

  const groups = groupTrashRows(rows, "az", START_OF_TODAY);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.title, "A to Z");
  assert.equal(groups[0]?.rows.length, 2);
  assert.equal(groupTrashRows(rows, "za", START_OF_TODAY)[0]?.title, "Z to A");
  assert.deepEqual(groupTrashRows([], "newest", START_OF_TODAY), []);
});

test("kind summaries leave out a kind with no rows", () => {
  const note = row({ id: "note" });
  const folder = row({ id: "folder", kind: "folder" });

  assert.equal(summarizeTrashKinds([note, note, folder]), "2 notes, 1 folder");
  assert.equal(summarizeTrashKinds([note]), "1 note");
  assert.equal(summarizeTrashKinds([folder, folder]), "2 folders");
});

test("row previews drop the repeated title and name empty notes", () => {
  assert.equal(
    trashRowPreview(row({ id: "math", title: "Math", snippet: "Math Write equations" })),
    "Write equations",
  );
  assert.equal(
    trashRowPreview(row({ id: "plain", title: "Plain", snippet: "Mathematics first" })),
    "Mathematics first",
  );
  assert.equal(trashRowPreview(row({ id: "bare", title: "Bare", snippet: "Bare" })), "Empty note");
  assert.equal(trashRowPreview(row({ id: "empty" })), "Empty note");
  assert.equal(
    trashRowPreview(row({ id: "folder", kind: "folder", summary: "1 folder, 2 notes" })),
    "1 folder, 2 notes",
  );
});

test("focus moves to the next row, or the previous one at the end", () => {
  const ids = ["a", "b", "c"];

  assert.equal(trashNeighborId(ids, "a"), "b");
  assert.equal(trashNeighborId(ids, "c"), "b");
  assert.equal(trashNeighborId(["a"], "a"), null);
  assert.equal(trashNeighborId(ids, "missing"), null);
});
