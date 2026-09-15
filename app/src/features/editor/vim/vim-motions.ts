import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  firstLine,
  hasCharacterAt,
  lastCursorIndex,
  lastLine,
  lineAbove,
  lineAt,
  lineBelow,
  lineOffset,
  lineStep,
  positionAt,
  type VimLine,
} from "./vim-lines";
import {
  bracketObject,
  findCharacter,
  firstNonBlank,
  isBlankLine,
  matchingBracket,
  nextWordStart,
  previousWordEnd,
  previousWordStart,
  quoteObject,
  wordEnd,
  wordObject,
  wordUnderCursor,
  type FindKind,
} from "./vim-text";
import type { VimMotion } from "./vim-parser";

export type LastFind = { find: FindKind; character: string };

export type SearchRequest = {
  pattern: string;
  backward: boolean;
  wholeWord: boolean;
  from: number;
};

export type MotionContext = {
  doc: ProseMirrorNode;
  cursor: number;
  count: number | null;
  /** Operator-pending motions may reach the position just past a line's last character. */
  operatorPending: boolean;
  /** For `cw`, which behaves like `ce`. */
  changeOperator: boolean;
  /** Column `j`/`k` try to return to; `Infinity` after `$`. */
  desiredColumn: number | null;
  lastFind: LastFind | null;
  /** Lines one page motion covers; roughly the visible height. */
  pageLines: number;
  /** Resolves `/`, `?`, `n`, `N`, `*`, and `#` to a document position. */
  search: (request: SearchRequest) => number | null;
  lastSearch: { pattern: string; backward: boolean; wholeWord: boolean } | null;
};

export type MotionTarget = {
  pos: number;
  linewise: boolean;
  inclusive: boolean;
  /** Set when the motion should keep the remembered column for the next `j`/`k`. */
  keepColumn: boolean;
  /** Column to remember after this motion; `Infinity` sticks to line ends. */
  desiredColumn: number | null;
  lastFind?: LastFind;
  lastSearch?: { pattern: string; backward: boolean; wholeWord: boolean };
  /** Motions like `j` at the document edge report failure so a bounded window can shift instead. */
  edge?: "start" | "end";
};

export type ObjectRange = { from: number; to: number; linewise: boolean };

function target(
  line: VimLine,
  column: number,
  extra: Partial<MotionTarget> = {},
): MotionTarget {
  return {
    pos: positionAt(line, column),
    linewise: false,
    inclusive: false,
    keepColumn: false,
    desiredColumn: column,
    ...extra,
  };
}

function linewiseTarget(line: VimLine, column: number, keepColumn = false): MotionTarget {
  return {
    pos: positionAt(line, column),
    linewise: true,
    inclusive: false,
    keepColumn,
    desiredColumn: keepColumn ? null : column,
  };
}

function clampedColumn(line: VimLine, column: number, operatorPending: boolean): number {
  return Math.min(column, operatorPending ? line.text.length : lastCursorIndex(line));
}

function verticalMotion(
  context: MotionContext,
  line: VimLine,
  column: number,
  direction: 1 | -1,
  count: number,
): MotionTarget | null {
  const stepped = lineStep(context.doc, line, direction, count);
  if (stepped.moved === 0) {
    return {
      pos: context.cursor,
      linewise: true,
      inclusive: false,
      keepColumn: true,
      desiredColumn: null,
      edge: direction === 1 ? "end" : "start",
    };
  }
  const wanted = context.desiredColumn ?? column;
  const resolved = Number.isFinite(wanted)
    ? clampedColumn(stepped.line, wanted, false)
    : lastCursorIndex(stepped.line);
  return linewiseTarget(stepped.line, resolved, true);
}

function wordForward(
  context: MotionContext,
  line: VimLine,
  column: number,
  count: number,
  bigWord: boolean,
): MotionTarget {
  let currentLine = line;
  let currentColumn = column;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const next = nextWordStart(currentLine.text, currentColumn, bigWord);
    if (next !== null) {
      currentColumn = next;
      continue;
    }
    const below = lineBelow(context.doc, currentLine);
    if (!below || (context.operatorPending && remaining === 1)) {
      return target(currentLine, context.operatorPending ? currentLine.text.length : lastCursorIndex(currentLine));
    }
    currentLine = below;
    currentColumn = isBlankLine(below.text) ? 0 : firstNonBlank(below.text);
    if (below.text.length === 0) continue;
  }
  return target(currentLine, currentColumn);
}

function wordEndForward(
  context: MotionContext,
  line: VimLine,
  column: number,
  count: number,
  bigWord: boolean,
): MotionTarget {
  let currentLine = line;
  let currentColumn = column;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    let end = wordEnd(currentLine.text, currentColumn, bigWord);
    while (end === null) {
      const below = lineBelow(context.doc, currentLine);
      if (!below) return target(currentLine, lastCursorIndex(currentLine), { inclusive: true });
      currentLine = below;
      currentColumn = -1;
      end = wordEnd(below.text, -1, bigWord);
    }
    currentColumn = end;
  }
  return target(currentLine, currentColumn, { inclusive: true });
}

function wordBackward(
  context: MotionContext,
  line: VimLine,
  column: number,
  count: number,
  bigWord: boolean,
): MotionTarget {
  let currentLine = line;
  let currentColumn = column;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    let start = previousWordStart(currentLine.text, currentColumn, bigWord);
    while (start === null) {
      const above = lineAbove(context.doc, currentLine);
      if (!above) return target(currentLine, 0);
      currentLine = above;
      currentColumn = above.text.length;
      start = isBlankLine(above.text) ? 0 : previousWordStart(above.text, above.text.length, bigWord);
    }
    currentColumn = start;
  }
  return target(currentLine, currentColumn);
}

function wordEndBackward(
  context: MotionContext,
  line: VimLine,
  column: number,
  count: number,
  bigWord: boolean,
): MotionTarget {
  let currentLine = line;
  let currentColumn = column;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    let end = previousWordEnd(currentLine.text, currentColumn, bigWord);
    while (end === null) {
      const above = lineAbove(context.doc, currentLine);
      if (!above) return target(currentLine, 0, { inclusive: true });
      currentLine = above;
      currentColumn = above.text.length;
      end = isBlankLine(above.text) ? 0 : lastCursorIndex(above);
    }
    currentColumn = end;
  }
  return target(currentLine, currentColumn, { inclusive: true });
}

function paragraphMotion(context: MotionContext, line: VimLine, direction: 1 | -1, count: number): MotionTarget {
  let currentLine = line;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    const topLevel = context.doc.resolve(currentLine.blockPos).index(0);
    let next: VimLine | null = currentLine;
    do {
      next = direction === 1 ? lineBelow(context.doc, next) : lineAbove(context.doc, next);
    } while (next && context.doc.resolve(next.blockPos).index(0) === topLevel);
    if (!next) {
      return direction === 1
        ? target(currentLine, context.operatorPending ? currentLine.text.length : lastCursorIndex(currentLine))
        : target(currentLine, 0);
    }
    if (direction === -1) {
      let first = next;
      let above = lineAbove(context.doc, first);
      const block = context.doc.resolve(next.blockPos).index(0);
      while (above && context.doc.resolve(above.blockPos).index(0) === block) {
        first = above;
        above = lineAbove(context.doc, first);
      }
      next = first;
    }
    currentLine = next;
  }
  return target(currentLine, 0);
}

function findMotion(
  line: VimLine,
  column: number,
  find: FindKind,
  character: string,
  count: number,
  repeat: boolean,
): MotionTarget | null {
  let found = findCharacter(line.text, column, find, character, count);
  const till = find === "t" || find === "T";
  if (repeat && till && found === column) {
    found = findCharacter(line.text, column, find, character, count + 1);
  }
  if (found === null) return null;
  const forward = find === "f" || find === "t";
  return target(line, found, { inclusive: forward, lastFind: { find, character } });
}

function searchMotion(
  context: MotionContext,
  request: { pattern: string; backward: boolean; wholeWord: boolean },
): MotionTarget | null {
  const pos = context.search({ ...request, from: context.cursor });
  if (pos === null) return null;
  const line = lineAt(context.doc, pos);
  if (!line) return null;
  return target(line, lineOffset(line, pos), { lastSearch: request });
}

/** Resolves a motion to its target cursor position, or null when it cannot move. */
export function resolveMotion(context: MotionContext, motion: VimMotion): MotionTarget | null {
  const line = lineAt(context.doc, context.cursor);
  if (!line) return null;
  const column = lineOffset(line, context.cursor);
  const count = context.count ?? 1;
  if (motion.kind === "find") {
    return findMotion(line, column, motion.find, motion.character, count, false);
  }
  if (motion.kind === "search") {
    return searchMotion(context, { pattern: motion.pattern, backward: motion.backward, wholeWord: false });
  }
  if (motion.kind === "textobject") return null;
  switch (motion.key) {
    case "h":
    case "<Left>":
    case "<BS>":
      return target(line, Math.max(0, column - count));
    case "l":
    case "<Right>":
    case "<Space>":
      return target(line, clampedColumn(line, column + count, context.operatorPending));
    case "j":
    case "gj":
    case "<Down>":
      return verticalMotion(context, line, column, 1, count);
    case "k":
    case "gk":
    case "<Up>":
      return verticalMotion(context, line, column, -1, count);
    case "<C-d>":
    case "<PageDown>":
    case "<C-f>":
      return verticalMotion(
        context,
        line,
        column,
        1,
        context.count ?? (motion.key === "<C-d>" ? Math.max(1, Math.floor(context.pageLines / 2)) : context.pageLines),
      );
    case "<C-u>":
    case "<PageUp>":
    case "<C-b>":
      return verticalMotion(
        context,
        line,
        column,
        -1,
        context.count ?? (motion.key === "<C-u>" ? Math.max(1, Math.floor(context.pageLines / 2)) : context.pageLines),
      );
    case "0":
    case "g0":
    case "<Home>":
      return target(line, 0);
    case "^":
      return target(line, firstNonBlank(line.text));
    case "$":
    case "g$":
    case "<End>": {
      const stepped = count > 1 ? lineStep(context.doc, line, 1, count - 1).line : line;
      return target(stepped, context.operatorPending ? stepped.text.length : lastCursorIndex(stepped), {
        inclusive: true,
        desiredColumn: Number.POSITIVE_INFINITY,
      });
    }
    case "g_": {
      const stepped = count > 1 ? lineStep(context.doc, line, 1, count - 1).line : line;
      const trimmed = stepped.text.replace(/\s+$/u, "");
      return target(stepped, Math.max(0, trimmed.length - 1), { inclusive: true });
    }
    case "|":
      return target(line, clampedColumn(line, count - 1, context.operatorPending));
    case "w":
    case "W": {
      const bigWord = motion.key === "W";
      if (context.changeOperator && hasCharacterAt(line, column) && !/\s/u.test(line.text[column]!)) {
        return wordEndForward(context, line, column, count, bigWord);
      }
      return wordForward(context, line, column, count, bigWord);
    }
    case "e":
    case "E":
      return wordEndForward(context, line, column, count, motion.key === "E");
    case "b":
    case "B":
      return wordBackward(context, line, column, count, motion.key === "B");
    case "ge":
    case "gE":
      return wordEndBackward(context, line, column, count, motion.key === "gE");
    case "G": {
      const last = lastLine(context.doc);
      if (!last) return null;
      return { ...linewiseTarget(last, firstNonBlank(last.text)), edge: "end" };
    }
    case "gg": {
      const first = firstLine(context.doc);
      if (!first) return null;
      return { ...linewiseTarget(first, firstNonBlank(first.text)), edge: "start" };
    }
    case "{":
      return paragraphMotion(context, line, -1, count);
    case "}":
      return paragraphMotion(context, line, 1, count);
    case "%": {
      const match = matchingBracket(line.text, column);
      return match === null ? null : target(line, match, { inclusive: true });
    }
    case "+":
    case "<CR>": {
      const stepped = lineStep(context.doc, line, 1, count);
      if (stepped.moved === 0) return null;
      return linewiseTarget(stepped.line, firstNonBlank(stepped.line.text));
    }
    case "-": {
      const stepped = lineStep(context.doc, line, -1, count);
      if (stepped.moved === 0) return null;
      return linewiseTarget(stepped.line, firstNonBlank(stepped.line.text));
    }
    case "_": {
      const stepped = count > 1 ? lineStep(context.doc, line, 1, count - 1).line : line;
      return linewiseTarget(stepped, firstNonBlank(stepped.text));
    }
    case ";":
    case ",": {
      const last = context.lastFind;
      if (!last) return null;
      const reversed: Record<FindKind, FindKind> = { f: "F", F: "f", t: "T", T: "t" };
      const find = motion.key === "," ? reversed[last.find] : last.find;
      const found = findMotion(line, column, find, last.character, count, true);
      return found ? { ...found, lastFind: last } : null;
    }
    case "n":
    case "N": {
      const last = context.lastSearch;
      if (!last) return null;
      return searchMotion(context, { ...last, backward: motion.key === "N" ? !last.backward : last.backward });
    }
    case "*":
    case "#": {
      const word = wordUnderCursor(line.text, column);
      if (!word) return null;
      return searchMotion(context, {
        pattern: line.text.slice(word.from, word.to),
        backward: motion.key === "#",
        wholeWord: true,
      });
    }
    default:
      return null;
  }
}

/** Resolves `iw`, `a"`, `ip` and friends to a document range. */
export function resolveTextObject(
  doc: ProseMirrorNode,
  cursor: number,
  motion: Extract<VimMotion, { kind: "textobject" }>,
  count: number | null,
): ObjectRange | null {
  const line = lineAt(doc, cursor);
  if (!line) return null;
  const column = lineOffset(line, cursor);
  if (motion.object === "p") {
    const stepped = lineStep(doc, line, 1, (count ?? 1) - 1);
    return { from: line.start, to: stepped.line.end, linewise: true };
  }
  let range: { from: number; to: number } | null = null;
  switch (motion.object) {
    case "w":
    case "W":
      range = wordObject(line.text, column, motion.around, motion.object === "W");
      for (let remaining = (count ?? 1) - 1; remaining > 0 && range; remaining -= 1) {
        const more = wordObject(line.text, range.to, motion.around, motion.object === "W");
        if (!more || more.to <= range.to) break;
        range = { from: range.from, to: more.to };
      }
      break;
    case '"':
    case "'":
    case "`":
      range = quoteObject(line.text, column, motion.object, motion.around);
      break;
    case "(":
    case ")":
    case "b":
      range = bracketObject(line.text, column, "(", motion.around);
      break;
    case "[":
    case "]":
      range = bracketObject(line.text, column, "[", motion.around);
      break;
    case "{":
    case "}":
    case "B":
      range = bracketObject(line.text, column, "{", motion.around);
      break;
    case "<":
    case ">":
      range = bracketObject(line.text, column, "<", motion.around);
      break;
    default:
      range = null;
  }
  if (!range) return null;
  return { from: positionAt(line, range.from), to: positionAt(line, range.to), linewise: false };
}
