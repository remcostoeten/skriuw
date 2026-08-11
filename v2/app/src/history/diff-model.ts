export type DiffSegment = {
  text: string;
  changed: boolean;
};

export type DiffLine = {
  key: string;
  kind: "context" | "added" | "removed";
  beforeLine: number | null;
  afterLine: number | null;
  segments: readonly DiffSegment[];
};

export type DiffHunk = {
  key: string;
  /** Unchanged lines skipped between the previous hunk and this one. */
  skippedBefore: number;
  lines: readonly DiffLine[];
};

export type DiffStats = {
  added: number;
  removed: number;
};

export type MarkdownDiff = {
  hunks: readonly DiffHunk[];
  stats: DiffStats;
  /** Set when the documents were too large to align line by line. */
  truncated: boolean;
};

const CONTEXT_LINES = 3;
const MAX_MATRIX_CELLS = 4_000_000;
const WORD_PATTERN = /(\s+|[^\s]+)/g;
const MIN_PAIR_SIMILARITY = 0.34;

type Op = { kind: "context" | "added" | "removed"; text: string };

function splitLines(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return normalized.length === 0 ? [] : normalized.split("\n");
}

function commonPrefixLength(before: readonly string[], after: readonly string[]): number {
  let index = 0;
  while (index < before.length && index < after.length && before[index] === after[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(
  before: readonly string[],
  after: readonly string[],
  limit: number,
): number {
  let index = 0;
  while (
    index < limit &&
    before[before.length - 1 - index] === after[after.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function lcsOps(before: readonly string[], after: readonly string[]): Op[] {
  const rows = before.length + 1;
  const columns = after.length + 1;
  const table = new Uint32Array(rows * columns);

  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      const index = row * columns + column;
      const skipRow = table[(row + 1) * columns + column] ?? 0;
      const skipColumn = table[index + 1] ?? 0;
      table[index] =
        before[row] === after[column]
          ? (table[(row + 1) * columns + column + 1] ?? 0) + 1
          : Math.max(skipRow, skipColumn);
    }
  }

  const ops: Op[] = [];
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      ops.push({ kind: "context", text: before[row] ?? "" });
      row += 1;
      column += 1;
    } else if (table[(row + 1) * columns + column]! >= table[row * columns + column + 1]!) {
      ops.push({ kind: "removed", text: before[row] ?? "" });
      row += 1;
    } else {
      ops.push({ kind: "added", text: after[column] ?? "" });
      column += 1;
    }
  }
  while (row < before.length) {
    ops.push({ kind: "removed", text: before[row] ?? "" });
    row += 1;
  }
  while (column < after.length) {
    ops.push({ kind: "added", text: after[column] ?? "" });
    column += 1;
  }
  return ops;
}

function tokenize(line: string): string[] {
  return line.match(WORD_PATTERN) ?? [];
}

function similarity(before: readonly string[], after: readonly string[]): number {
  if (before.length === 0 && after.length === 0) {
    return 1;
  }
  const pool = new Map<string, number>();
  for (const token of before) {
    if (token.trim().length > 0) {
      pool.set(token, (pool.get(token) ?? 0) + 1);
    }
  }
  let shared = 0;
  for (const token of after) {
    const remaining = pool.get(token) ?? 0;
    if (remaining > 0) {
      pool.set(token, remaining - 1);
      shared += 1;
    }
  }
  const total = Math.max(before.length, after.length);
  return total === 0 ? 1 : shared / total;
}

function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    if (segment.text.length === 0) {
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && last.changed === segment.changed) {
      last.text += segment.text;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

/**
 * Splits a replaced line pair into word-level segments so the rendered diff can
 * highlight only the words that moved, instead of tinting the whole line.
 */
export function diffWords(
  before: string,
  after: string,
): { before: DiffSegment[]; after: DiffSegment[] } {
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  if (similarity(beforeTokens, afterTokens) < MIN_PAIR_SIMILARITY) {
    return {
      before: before.length > 0 ? [{ text: before, changed: true }] : [],
      after: after.length > 0 ? [{ text: after, changed: true }] : [],
    };
  }

  const ops = lcsOps(beforeTokens, afterTokens);
  const beforeSegments: DiffSegment[] = [];
  const afterSegments: DiffSegment[] = [];
  for (const op of ops) {
    if (op.kind === "context") {
      beforeSegments.push({ text: op.text, changed: false });
      afterSegments.push({ text: op.text, changed: false });
    } else if (op.kind === "removed") {
      beforeSegments.push({ text: op.text, changed: true });
    } else {
      afterSegments.push({ text: op.text, changed: true });
    }
  }
  return { before: mergeSegments(beforeSegments), after: mergeSegments(afterSegments) };
}

function refinePairs(lines: DiffLine[]): DiffLine[] {
  const refined = [...lines];
  let index = 0;
  while (index < refined.length) {
    let removedEnd = index;
    while (refined[removedEnd]?.kind === "removed") {
      removedEnd += 1;
    }
    let addedEnd = removedEnd;
    while (refined[addedEnd]?.kind === "added") {
      addedEnd += 1;
    }
    const removedCount = removedEnd - index;
    const addedCount = addedEnd - removedEnd;
    if (removedCount > 0 && removedCount === addedCount) {
      for (let offset = 0; offset < removedCount; offset += 1) {
        const removed = refined[index + offset];
        const added = refined[removedEnd + offset];
        if (!removed || !added) {
          continue;
        }
        const words = diffWords(lineText(removed), lineText(added));
        refined[index + offset] = { ...removed, segments: words.before };
        refined[removedEnd + offset] = { ...added, segments: words.after };
      }
    }
    index = addedEnd > index ? addedEnd : index + 1;
  }
  return refined;
}

function lineText(line: DiffLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

function toLine(op: Op, beforeLine: number | null, afterLine: number | null, key: string): DiffLine {
  return {
    key,
    kind: op.kind,
    beforeLine,
    afterLine,
    segments: op.text.length > 0 ? [{ text: op.text, changed: false }] : [],
  };
}

function buildHunks(lines: readonly DiffLine[]): DiffHunk[] {
  const changedIndexes = lines
    .map((line, index) => (line.kind === "context" ? -1 : index))
    .filter((index) => index !== -1);
  if (changedIndexes.length === 0) {
    return [];
  }

  const ranges: { start: number; end: number }[] = [];
  for (const index of changedIndexes) {
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, index + CONTEXT_LINES);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
      continue;
    }
    ranges.push({ start, end });
  }

  let previousEnd = -1;
  return ranges.map((range, index) => {
    const skippedBefore = range.start - previousEnd - 1;
    previousEnd = range.end;
    return {
      key: `hunk-${index}`,
      skippedBefore: Math.max(0, skippedBefore),
      lines: lines.slice(range.start, range.end + 1),
    };
  });
}

/**
 * Diffs two markdown documents line by line, grouping changes into hunks with
 * bounded context and word-level segments for one-to-one replacements.
 */
export function diffMarkdown(beforeMarkdown: string, afterMarkdown: string): MarkdownDiff {
  const before = splitLines(beforeMarkdown);
  const after = splitLines(afterMarkdown);

  const prefix = commonPrefixLength(before, after);
  const suffixLimit = Math.min(before.length, after.length) - prefix;
  const suffix = commonSuffixLength(before, after, Math.max(0, suffixLimit));
  const beforeMiddle = before.slice(prefix, before.length - suffix);
  const afterMiddle = after.slice(prefix, after.length - suffix);

  const truncated = (beforeMiddle.length + 1) * (afterMiddle.length + 1) > MAX_MATRIX_CELLS;
  const middleOps: Op[] = truncated
    ? [
        ...beforeMiddle.map((text): Op => ({ kind: "removed", text })),
        ...afterMiddle.map((text): Op => ({ kind: "added", text })),
      ]
    : lcsOps(beforeMiddle, afterMiddle);

  const ops: Op[] = [
    ...before.slice(0, prefix).map((text): Op => ({ kind: "context", text })),
    ...middleOps,
    ...before.slice(before.length - suffix).map((text): Op => ({ kind: "context", text })),
  ];

  let beforeCursor = 0;
  let afterCursor = 0;
  let added = 0;
  let removed = 0;
  const lines = ops.map((op, index) => {
    if (op.kind === "context") {
      beforeCursor += 1;
      afterCursor += 1;
      return toLine(op, beforeCursor, afterCursor, `line-${index}`);
    }
    if (op.kind === "removed") {
      beforeCursor += 1;
      removed += 1;
      return toLine(op, beforeCursor, null, `line-${index}`);
    }
    afterCursor += 1;
    added += 1;
    return toLine(op, null, afterCursor, `line-${index}`);
  });

  return {
    hunks: buildHunks(truncated ? lines : refinePairs(lines)),
    stats: { added, removed },
    truncated,
  };
}
