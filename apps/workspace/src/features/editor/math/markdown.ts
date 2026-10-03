import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { defaultMarkdownParser } from "prosemirror-markdown";

type MarkdownTokenizer = typeof defaultMarkdownParser.tokenizer;
type InlineRule = Parameters<MarkdownTokenizer["inline"]["ruler"]["before"]>[2];
type BlockRule = Parameters<MarkdownTokenizer["block"]["ruler"]["before"]>[2];

export const MATH_FENCE = "$$";

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character);
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

/**
 * @name findInlineMathEnd
 * @description Finds the closing `$` of a strict inline math span opened at
 * `open`. The opening `$` must be followed by a non-space character that is not
 * another `$`; the closing `$` must follow a non-space character, must not be
 * followed by a digit, and must sit on the same line. Backslash escapes inside
 * the span are skipped, so `\$` never closes it. Returns -1 when the source
 * holds no valid span there, which keeps a lone `$name` people mention and
 * prices such as `$5 and $10` as text.
 *
 * @example
 * findInlineMathEnd("$x^2$ and more", 0); // 4
 * findInlineMathEnd("$ada met $bob", 0); // -1
 */
export function findInlineMathEnd(source: string, open: number, limit = source.length): number {
  if (source.charCodeAt(open) !== DOLLAR) return -1;
  const first = source[open + 1];
  if (first === undefined || first === "$" || isWhitespace(first)) return -1;
  for (let index = open + 1; index < limit; index += 1) {
    const code = source.charCodeAt(index);
    if (code === BACKSLASH) {
      index += 1;
      continue;
    }
    if (source[index] === "\n") return -1;
    if (code !== DOLLAR) continue;
    if (isWhitespace(source[index - 1]) || isDigit(source[index + 1])) continue;
    return index;
  }
  return -1;
}

export const inlineMathRule: InlineRule = (state, silent) => {
  const end = findInlineMathEnd(state.src, state.pos, state.posMax);
  if (end === -1) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = state.src.slice(state.pos + 1, end);
    token.markup = "$";
  }
  state.pos = end + 1;
  return true;
};

function lineText(state: Parameters<BlockRule>[0], line: number): { text: string; indent: number } {
  const start = (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
  const end = state.eMarks[line] ?? start;
  return {
    text: state.src.slice(start, end).trim(),
    indent: (state.sCount[line] ?? 0) - state.blkIndent,
  };
}

const SINGLE_LINE_BLOCK = /^\$\$(.+)\$\$$/;

/**
 * @name mathBlockRule
 * @description markdown-it block rule for display math: a line holding only
 * `$$`, the TeX source, and a closing line holding only `$$`. A one-line
 * `$$...$$` is accepted too, since other editors write it, and is normalized
 * to the fenced form on export. An unclosed fence stays ordinary text.
 *
 * @example
 * tokenizer.block.ruler.before("fence", "math_block", mathBlockRule);
 */
export const mathBlockRule: BlockRule = (state, startLine, endLine, silent) => {
  const opening = lineText(state, startLine);
  if (opening.indent >= 4 || !opening.text.startsWith(MATH_FENCE)) return false;
  const singleLine = opening.text.match(SINGLE_LINE_BLOCK);
  let closingLine = startLine;
  let content: string;
  if (singleLine) {
    content = (singleLine[1] ?? "").trim();
  } else {
    if (opening.text !== MATH_FENCE) return false;
    closingLine = -1;
    for (let line = startLine + 1; line < endLine; line += 1) {
      const candidate = lineText(state, line);
      if (candidate.text === MATH_FENCE && candidate.indent < 4) {
        closingLine = line;
        break;
      }
    }
    if (closingLine === -1) return false;
    const lines: string[] = [];
    for (let line = startLine + 1; line < closingLine; line += 1) {
      lines.push(state.getLines(line, line + 1, state.blkIndent, false).replace(/\n$/, ""));
    }
    content = lines.join("\n");
  }
  if (silent) return true;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content;
  token.markup = MATH_FENCE;
  token.map = [startLine, closingLine + 1];
  state.line = closingLine + 1;
  return true;
};

type SourceCharacter = {
  character: string;
  child: number;
  offset: number;
  escapable: boolean;
  escapes: boolean;
};

function inlineSource(parent: ProseMirrorNode): SourceCharacter[] {
  const characters: SourceCharacter[] = [];
  function push(text: string, child: number, escapable: boolean, escapes: boolean) {
    for (let offset = 0; offset < text.length; offset += 1) {
      characters.push({ character: text[offset] ?? "", child, offset, escapable, escapes });
    }
  }
  parent.forEach((node, _position, child) => {
    if (node.isText) {
      const isCode = node.marks.some((mark) => mark.type.spec.code === true);
      push(isCode ? "x".repeat(node.text?.length ?? 0) : (node.text ?? ""), child, !isCode, false);
      return;
    }
    switch (node.type.name) {
      case "math_inline": {
        const tex = String(node.attrs.tex ?? "").trim();
        if (tex) push(`$${tex}$`, child, false, true);
        return;
      }
      case "mention_ref":
        push(
          node.attrs.kind === "person" ? `$${String(node.attrs.label)}` : "x",
          child,
          false,
          false,
        );
        return;
      case "hard_break":
        push("\n", child, false, false);
        return;
      default:
        push("x", child, false, false);
    }
  });
  return characters;
}

function canOpen(characters: readonly SourceCharacter[], index: number): boolean {
  const next = characters[index + 1]?.character;
  return next !== undefined && next !== "$" && !isWhitespace(next);
}

function canClose(characters: readonly SourceCharacter[], index: number): boolean {
  return (
    !isWhitespace(characters[index - 1]?.character) && !isDigit(characters[index + 1]?.character)
  );
}

function closingIndex(
  characters: readonly SourceCharacter[],
  open: number,
  escaped: ReadonlySet<number>,
): number {
  for (let index = open + 1; index < characters.length; index += 1) {
    const current = characters[index];
    if (!current || current.character === "\n") return -1;
    if (current.escapes && current.character === "\\") {
      index += 1;
      continue;
    }
    if (current.character !== "$" || escaped.has(index)) continue;
    if (canClose(characters, index)) return index;
  }
  return -1;
}

const escapeCache = new WeakMap<ProseMirrorNode, Map<number, number[]>>();

function escapeRun(
  characters: readonly SourceCharacter[],
  escaped: Set<number>,
  index: number,
): void {
  escaped.add(index);
  // `$\$` would let the bare dollar open a span, so a run of dollars is escaped as a whole.
  for (let before = index - 1; before >= 0; before -= 1) {
    const character = characters[before];
    if (!character || character.character !== "$" || !character.escapable) return;
    escaped.add(before);
  }
}

function computeDollarEscapes(parent: ProseMirrorNode): Map<number, number[]> {
  const characters = inlineSource(parent);
  const escaped = new Set<number>();
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    if (!current || current.character !== "$" || escaped.has(index)) continue;
    if (!canOpen(characters, index)) continue;
    let close = closingIndex(characters, index, escaped);
    if (close === -1) continue;
    if (current.escapable) {
      escapeRun(characters, escaped, index);
      continue;
    }
    while (close !== -1 && characters[close]?.escapable) {
      escapeRun(characters, escaped, close);
      close = closingIndex(characters, index, escaped);
    }
    if (close !== -1) index = close;
  }
  const byChild = new Map<number, number[]>();
  for (const index of [...escaped].sort((left, right) => left - right)) {
    const character = characters[index];
    if (!character) continue;
    const offsets = byChild.get(character.child) ?? [];
    offsets.push(character.offset);
    byChild.set(character.child, offsets);
  }
  return byChild;
}

/**
 * @name mathDollarEscapes
 * @description Lists the offsets of `$` characters in one text child of a
 * textblock that must be written as `\$`, because leaving them bare would make
 * the exported Markdown read back as inline math. Only dollars that would
 * actually pair up are escaped, so prices and `$name` people mentions export
 * unchanged. Results are cached per immutable parent node.
 *
 * @example
 * const offsets = mathDollarEscapes(paragraph, 0); // [2] for the text "a $b$ c"
 */
export function mathDollarEscapes(parent: ProseMirrorNode, child: number): readonly number[] {
  let byChild = escapeCache.get(parent);
  if (!byChild) {
    byChild = computeDollarEscapes(parent);
    escapeCache.set(parent, byChild);
  }
  return byChild.get(child) ?? [];
}
