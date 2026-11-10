import { groupVersionRows, type VersionListItem } from "../versions/model";

export type LedgerDayRow = {
  kind: "day";
  key: string;
  label: string;
  count: number;
  netDelta: number | null;
};

export type LedgerVersionRow = {
  kind: "version";
  key: string;
  index: number;
  item: VersionListItem;
  magnitude: number;
  lastOfDay: boolean;
};

export type LedgerRow = LedgerDayRow | LedgerVersionRow;

/**
 * @name buildLedgerRows
 * @description Turns a newest-first version list into history ledger rows: a
 * day row with the day's net word change before each calendar day, then one
 * row per revision carrying the size of its change as a 0 to 1 fraction of the
 * largest change in the list.
 *
 * @example
 * const rows = buildLedgerRows(projectVersionList(headers));
 * rows[0]; // { kind: "day", label: "Today", count: 3, netDelta: 25, ... }
 */
export function buildLedgerRows(
  versions: readonly VersionListItem[],
  now: number = Date.now(),
): LedgerRow[] {
  const largest = versions.reduce(
    (max, item) => (item.wordDelta === null ? max : Math.max(max, Math.abs(item.wordDelta))),
    0,
  );
  const rows: LedgerRow[] = [];
  let day: LedgerDayRow | null = null;
  for (const row of groupVersionRows(versions, now)) {
    if (row.kind === "group") {
      day = { kind: "day", key: row.key, label: row.label, count: row.count, netDelta: null };
      rows.push(day);
      continue;
    }
    const delta = row.item.wordDelta;
    if (day !== null && delta !== null) {
      day.netDelta = (day.netDelta ?? 0) + delta;
    }
    rows.push({
      kind: "version",
      key: row.key,
      index: row.index,
      item: row.item,
      magnitude: delta === null || largest === 0 ? 0 : Math.sqrt(Math.abs(delta) / largest),
      lastOfDay: false,
    });
  }
  rows.forEach((row, position) => {
    if (row.kind === "version" && rows[position + 1]?.kind !== "version") {
      row.lastOfDay = true;
    }
  });
  return rows;
}

/**
 * @name formatSignedWords
 * @description Formats a word change as a signed number with a true minus
 * sign, or an empty string when the change is unknown.
 *
 * @example
 * formatSignedWords(-6); // "−6"
 */
export function formatSignedWords(delta: number | null): string {
  if (delta === null) {
    return "";
  }
  if (delta > 0) {
    return `+${delta}`;
  }
  return delta < 0 ? `−${Math.abs(delta)}` : "0";
}

/**
 * @name describeWordDelta
 * @description Spells out a revision's word change for tooltips and screen
 * readers, or returns undefined when the change is unknown.
 *
 * @example
 * describeWordDelta(1); // "1 word added in this revision"
 */
export function describeWordDelta(delta: number | null): string | undefined {
  if (delta === null) {
    return undefined;
  }
  if (delta === 0) {
    return "No change in length in this revision";
  }
  const magnitude = Math.abs(delta);
  return `${magnitude} ${magnitude === 1 ? "word" : "words"} ${delta > 0 ? "added" : "removed"} in this revision`;
}

/**
 * @name stepVersionId
 * @description The version a keyboard step lands on from another version,
 * clamped to the ends of the newest-first list. A null start lands on the
 * newest version.
 *
 * @example
 * stepVersionId(versions, "v3", 1); // the next older version id
 */
export function stepVersionId(
  versions: readonly VersionListItem[],
  fromVersionId: string | null,
  step: number,
): string | null {
  if (versions.length === 0) {
    return null;
  }
  const index = versions.findIndex((item) => item.versionId === fromVersionId);
  if (index === -1) {
    return versions[0]?.versionId ?? null;
  }
  const next = Math.max(0, Math.min(versions.length - 1, index + step));
  return versions[next]?.versionId ?? null;
}
