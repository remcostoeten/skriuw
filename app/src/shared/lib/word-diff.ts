export type DiffSegment = {
  text: string;
  changed: boolean;
};

const WORD_PATTERN = /(\s+|[^\s]+)/g;
const MIN_PAIR_SIMILARITY = 0.34;
const MAX_LINE_DIFF_CHARS = 4096;

/**
 * The alignment table is dense, so an unbounded pair would allocate
 * `before × after` words of memory. Anything past the budget falls back to
 * whole-blob segments rather than trying.
 */
const MAX_MATRIX_CELLS = 4_000_000;

type Op = { kind: "context" | "added" | "removed"; text: string };

/**
 * Longest-common-subsequence alignment over two token runs. Callers must keep
 * `before.length * after.length` inside their own budget before calling.
 */
export function lcsOps(before: readonly string[], after: readonly string[]): Op[] {
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

export function tokenizeWords(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

export function wordSimilarity(
  before: readonly string[],
  after: readonly string[],
): number {
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

export function mergeSegments(segments: readonly DiffSegment[]): DiffSegment[] {
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

function wholeBlob(before: string, after: string): {
  before: DiffSegment[];
  after: DiffSegment[];
} {
  return {
    before: before.length > 0 ? [{ text: before, changed: true }] : [],
    after: after.length > 0 ? [{ text: after, changed: true }] : [],
  };
}

/**
 * Collects the segments one diff side sees, then absorbs a single-character
 * unchanged gap between two changed runs into the highlight so "old words" →
 * "new words" reads as one span instead of two marks split by a space.
 */
function sideSegments(ops: readonly Op[], changedKind: "removed" | "added"): DiffSegment[] {
  const runs: DiffSegment[] = [];
  for (const op of ops) {
    if (op.kind !== "context" && op.kind !== changedKind) {
      continue;
    }
    const changed = op.kind === changedKind;
    const last = runs[runs.length - 1];
    if (last && last.changed === changed) {
      last.text += op.text;
    } else {
      runs.push({ text: op.text, changed });
    }
  }
  const joined: DiffSegment[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index]!;
    const previous = joined[joined.length - 1];
    if (!run.changed && run.text.length === 1 && previous?.changed && index < runs.length - 1) {
      previous.text += run.text;
      continue;
    }
    joined.push({ ...run });
  }
  return mergeSegments(joined);
}

/**
 * Splits a replaced text pair into word-level segments so a rendered diff can
 * highlight only the words that moved, instead of tinting the whole thing. Two
 * texts with little in common are reported as one wholesale replacement, which
 * reads better than a confetti of coincidental matches.
 */
export function diffWords(
  before: string,
  after: string,
): { before: DiffSegment[]; after: DiffSegment[] } {
  if (before.length > MAX_LINE_DIFF_CHARS || after.length > MAX_LINE_DIFF_CHARS) {
    return wholeBlob(before, after);
  }
  const beforeTokens = tokenizeWords(before);
  const afterTokens = tokenizeWords(after);
  if (beforeTokens.length * afterTokens.length > MAX_MATRIX_CELLS) {
    return wholeBlob(before, after);
  }
  if (wordSimilarity(beforeTokens, afterTokens) < MIN_PAIR_SIMILARITY) {
    return wholeBlob(before, after);
  }

  const ops = lcsOps(beforeTokens, afterTokens);
  return { before: sideSegments(ops, "removed"), after: sideSegments(ops, "added") };
}
