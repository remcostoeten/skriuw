import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { HistoryHeader, WorkspaceOperation } from "@/contracts/workspace";
import {
  countWords,
  parseProductMarkdown,
} from "@/features/editor/schema";

export type VersionListItem = {
  versionId: string;
  createdAt: number;
  summary: string;
  additions: number | null;
  deletions: number | null;
  wordCount: number | null;
  /**
   * Words gained or lost against the previous revision. Null on the oldest
   * revision, and on any revision captured before word counts were recorded.
   */
  wordDelta: number | null;
};

export function projectVersionList(
  headers: readonly HistoryHeader[] | null | undefined,
): VersionListItem[] {
  if (!headers || headers.length === 0) {
    return [];
  }
  const ordered = [...headers].sort((left, right) => right.createdAt - left.createdAt);
  return ordered.map((header, index) => {
    const wordCount = header.wordCount ?? null;
    const previous = ordered[index + 1]?.wordCount ?? null;
    return {
      versionId: header.versionId,
      createdAt: header.createdAt,
      summary: header.summary,
      additions: header.additions ?? null,
      deletions: header.deletions ?? null,
      wordCount,
      wordDelta: wordCount === null || previous === null ? null : wordCount - previous,
    };
  });
}

export type VersionRow =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "version"; key: string; index: number; item: VersionListItem };

const clockFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const stampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The wall-clock time a revision was captured, e.g. `22:34`. */
export function formatVersionClock(timestamp: number): string {
  return clockFormatter.format(new Date(timestamp));
}

/** The full date and time a revision was captured, for tooltips. */
export function formatVersionTimestamp(timestamp: number): string {
  return stampFormatter.format(new Date(timestamp));
}

const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const monthDayFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const monthDayYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayLabel(dayStart: number, todayStart: number): string {
  const days = Math.round((todayStart - dayStart) / 86_400_000);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  const date = new Date(dayStart);
  if (days < 7) {
    return weekdayFormatter.format(date);
  }
  return date.getFullYear() === new Date(todayStart).getFullYear()
    ? monthDayFormatter.format(date)
    : monthDayYearFormatter.format(date);
}

/**
 * Flattens a newest-first version list into virtualizer rows, inserting a
 * sticky day header before the first revision captured on each calendar day.
 */
export function groupVersionRows(
  versions: readonly VersionListItem[],
  now: number = Date.now(),
): VersionRow[] {
  const todayStart = startOfDay(now);
  const rows: VersionRow[] = [];
  let currentDay: number | null = null;
  let currentHeader: Extract<VersionRow, { kind: "group" }> | null = null;

  versions.forEach((item, index) => {
    const day = startOfDay(item.createdAt);
    if (day !== currentDay) {
      currentDay = day;
      currentHeader = { kind: "group", key: `day-${day}`, label: dayLabel(day, todayStart), count: 0 };
      rows.push(currentHeader);
    }
    if (currentHeader) {
      currentHeader.count += 1;
    }
    rows.push({ kind: "version", key: item.versionId, index, item });
  });

  return rows;
}

export function parseHistoryMarkdown(markdown: string): ProseMirrorNode {
  return parseProductMarkdown(markdown);
}

export type RestoreDocument = {
  documentJson: unknown;
  markdown: string;
  wordCount: number;
};

export function buildRestoreDocument(versionMarkdown: string): RestoreDocument {
  const node = parseHistoryMarkdown(versionMarkdown);
  return {
    documentJson: node.toJSON(),
    markdown: versionMarkdown,
    wordCount: countWords(node),
  };
}

export type RestoreOperationParams = {
  noteId: string;
  versionMarkdown: string;
  expectedRevision: number;
  at: number;
};

export function buildRestoreOperation(params: RestoreOperationParams): WorkspaceOperation {
  const document = buildRestoreDocument(params.versionMarkdown);
  return {
    type: "save_document",
    noteId: params.noteId,
    documentJson: document.documentJson,
    markdown: document.markdown,
    wordCount: document.wordCount,
    expectedRevision: params.expectedRevision,
    at: params.at,
  };
}
