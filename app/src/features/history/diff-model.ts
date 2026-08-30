import { diffWords, lcsOps, type DiffSegment } from "@/shared/lib/word-diff";

export type { DiffSegment };

export type DiffLine = {
  key: string;
  kind: "context" | "added" | "removed";
  beforeLine: number | null;
  afterLine: number | null;
  segments: readonly DiffSegment[];
};

export type DiffHunk = {
  key: string;
  /** Unchanged lines collapsed between the previous hunk and this one. */
  hiddenBefore: readonly DiffLine[];
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
const MAX_ALIGNMENT_COMPARISONS = 4096;
const MIN_IMPROVEMENT_PER_PAIR = 0.5;

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

/**
 * Slides a pure insert or delete run made entirely of identical blank lines to
 * the top of the blank run it sits in. Diffing anchors a blank-line change at
 * the bottom of the run, so pressing Enter at the end of a paragraph marks a
 * blank *below* the caret as added; sliding up anchors the change to the
 * content above it instead. Texts inside the slid region are identical, so
 * only the op kinds move.
 */
function slideBlankRunsUp(ops: Op[]): Op[] {
  const result = [...ops];
  let index = 0;
  while (index < result.length) {
    const first = result[index]!;
    if (first.kind === "context") {
      index += 1;
      continue;
    }
    let end = index;
    let pure = true;
    while (end < result.length && result[end]!.kind !== "context") {
      if (result[end]!.kind !== first.kind) {
        pure = false;
      }
      end += 1;
    }
    const unit = first.text;
    const uniformBlank =
      pure &&
      unit.trim() === "" &&
      result.slice(index, end).every((op) => op.text === unit);
    if (uniformBlank) {
      let slide = 0;
      while (
        slide < index &&
        result[index - 1 - slide]!.kind === "context" &&
        result[index - 1 - slide]!.text === unit
      ) {
        slide += 1;
      }
      if (slide > 0) {
        const runLength = end - index;
        for (let position = index - slide; position < end; position += 1) {
          const kind = position < index - slide + runLength ? first.kind : "context";
          result[position] = { kind, text: unit };
        }
      }
    }
    index = end;
  }
  return result;
}

const WHITESPACE = /\s+/g;

function lineSimilarity(before: string, after: string): number {
  const strippedBefore = before.replace(WHITESPACE, "");
  const strippedAfter = after.replace(WHITESPACE, "");
  if (strippedBefore === strippedAfter) {
    return 1;
  }
  const maxLength = Math.max(strippedBefore.length, strippedAfter.length);
  const minLength = Math.min(strippedBefore.length, strippedAfter.length);
  if (minLength === 0) {
    return 0;
  }
  let prefix = 0;
  while (prefix < minLength && strippedBefore[prefix] === strippedAfter[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < minLength - prefix &&
    strippedBefore[strippedBefore.length - 1 - suffix] === strippedAfter[strippedAfter.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return (prefix + suffix) / maxLength;
}

/**
 * Picks where the paired window sits inside the longer side of a
 * count-mismatched change block, so lines pair by content similarity instead
 * of position. Returns 0 when no offset clearly beats positional pairing.
 */
function bestPairOffset(removed: readonly DiffLine[], added: readonly DiffLine[]): number {
  const pairCount = Math.min(removed.length, added.length);
  const surplus = Math.abs(removed.length - added.length);
  if (pairCount === 0 || surplus === 0 || pairCount * (surplus + 1) > MAX_ALIGNMENT_COMPARISONS) {
    return 0;
  }
  const removedTexts = removed.map(lineText);
  const addedTexts = added.map(lineText);
  const addedIsLonger = added.length > removed.length;
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset <= surplus; offset += 1) {
    let score = 0;
    for (let pair = 0; pair < pairCount; pair += 1) {
      score += lineSimilarity(
        removedTexts[pair + (addedIsLonger ? 0 : offset)]!,
        addedTexts[pair + (addedIsLonger ? offset : 0)]!,
      );
    }
    if (offset === 0) {
      bestScore = score + pairCount * MIN_IMPROVEMENT_PER_PAIR;
    } else if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

function refineChangeBlock(removed: readonly DiffLine[], added: readonly DiffLine[]): DiffLine[] {
  if (removed.length === 0 || added.length === 0) {
    return [...removed, ...added];
  }
  const offset = removed.length === added.length ? 0 : bestPairOffset(removed, added);
  const pairCount = Math.min(removed.length, added.length);
  const removedOffset = removed.length > added.length ? offset : 0;
  const addedOffset = added.length > removed.length ? offset : 0;

  const pairedRemoved: DiffLine[] = [];
  const pairedAdded: DiffLine[] = [];
  for (let pair = 0; pair < pairCount; pair += 1) {
    const removedLine = removed[removedOffset + pair]!;
    const addedLine = added[addedOffset + pair]!;
    const words = diffWords(lineText(removedLine), lineText(addedLine));
    pairedRemoved.push({ ...removedLine, segments: words.before });
    pairedAdded.push({ ...addedLine, segments: words.after });
  }

  return [
    ...removed.slice(0, removedOffset),
    ...added.slice(0, addedOffset),
    ...pairedRemoved,
    ...pairedAdded,
    ...removed.slice(removedOffset + pairCount),
    ...added.slice(addedOffset + pairCount),
  ];
}

function refinePairs(lines: readonly DiffLine[]): DiffLine[] {
  const refined: DiffLine[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.kind === "context") {
      refined.push(line);
      index += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && lines[index]!.kind !== "context") {
      (lines[index]!.kind === "removed" ? removed : added).push(lines[index]!);
      index += 1;
    }
    refined.push(...refineChangeBlock(removed, added));
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
    const hiddenBefore = lines.slice(previousEnd + 1, range.start);
    previousEnd = range.end;
    return {
      key: `hunk-${index}`,
      hiddenBefore,
      lines: lines.slice(range.start, range.end + 1),
    };
  });
}

/**
 * Diffs two markdown documents line by line, grouping changes into hunks with
 * bounded context. Replaced lines pair up by content similarity and carry
 * word-level segments; blank-line insertions anchor to the content above them.
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

  const joinedOps: Op[] = [
    ...before.slice(0, prefix).map((text): Op => ({ kind: "context", text })),
    ...middleOps,
    ...before.slice(before.length - suffix).map((text): Op => ({ kind: "context", text })),
  ];
  const ops = truncated ? joinedOps : slideBlankRunsUp(joinedOps);

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
