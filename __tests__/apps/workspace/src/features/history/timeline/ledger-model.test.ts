import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildLedgerRows,
  describeWordDelta,
  formatSignedWords,
  stepVersionId,
} from "@/features/history/timeline/ledger-model";
import type { VersionListItem } from "@/features/history/versions/model";

function atLocalTime(dayOffset: number, hour: number): number {
  const date = new Date(2026, 7, 10, hour, 0, 0, 0);
  date.setDate(date.getDate() - dayOffset);
  return date.getTime();
}

const NOW = atLocalTime(0, 23);

function version(versionId: string, createdAt: number, wordDelta: number | null): VersionListItem {
  return {
    versionId,
    createdAt,
    summary: versionId,
    additions: null,
    deletions: null,
    wordCount: null,
    wordDelta,
  };
}

const VERSIONS = [
  version("a", atLocalTime(0, 15), 16),
  version("b", atLocalTime(0, 10), -4),
  version("c", atLocalTime(1, 9), 4),
  version("d", atLocalTime(1, 8), null),
];

test("buildLedgerRows puts a day row with the net word change before each day", () => {
  const days = buildLedgerRows(VERSIONS, NOW).flatMap((row) =>
    row.kind === "day" ? [[row.label, row.count, row.netDelta]] : [],
  );

  assert.deepEqual(days, [
    ["Today", 2, 12],
    ["Yesterday", 2, 4],
  ]);
});

test("buildLedgerRows leaves the day net change unknown when no revision has a delta", () => {
  const rows = buildLedgerRows([version("a", atLocalTime(0, 9), null)], NOW);

  assert.equal(rows[0]?.kind === "day" ? rows[0].netDelta : "missing", null);
});

test("buildLedgerRows scales each change against the largest one", () => {
  const magnitudes = buildLedgerRows(VERSIONS, NOW).flatMap((row) =>
    row.kind === "version" ? [[row.item.versionId, row.magnitude]] : [],
  );

  assert.deepEqual(magnitudes, [
    ["a", 1],
    ["b", 0.5],
    ["c", 0.5],
    ["d", 0],
  ]);
});

test("buildLedgerRows marks the last revision of each day", () => {
  const last = buildLedgerRows(VERSIONS, NOW).flatMap((row) =>
    row.kind === "version" && row.lastOfDay ? [row.item.versionId] : [],
  );

  assert.deepEqual(last, ["b", "d"]);
});

test("formatSignedWords signs the change with a true minus sign", () => {
  assert.equal(formatSignedWords(5), "+5");
  assert.equal(formatSignedWords(-6), "−6");
  assert.equal(formatSignedWords(0), "0");
  assert.equal(formatSignedWords(null), "");
});

test("describeWordDelta spells out the change in words", () => {
  assert.equal(describeWordDelta(1), "1 word added in this revision");
  assert.equal(describeWordDelta(-3), "3 words removed in this revision");
  assert.equal(describeWordDelta(0), "No change in length in this revision");
  assert.equal(describeWordDelta(null), undefined);
});

test("stepVersionId moves through the list and stops at either end", () => {
  assert.equal(stepVersionId(VERSIONS, "a", 1), "b");
  assert.equal(stepVersionId(VERSIONS, "b", -1), "a");
  assert.equal(stepVersionId(VERSIONS, "a", -1), "a");
  assert.equal(stepVersionId(VERSIONS, "c", 10), "d");
  assert.equal(stepVersionId(VERSIONS, null, 1), "a");
  assert.equal(stepVersionId([], "a", 1), null);
});
