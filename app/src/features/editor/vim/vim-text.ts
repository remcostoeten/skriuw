/**
 * Vim's text grammar on one line of plain text. Everything here is a pure
 * function over a string and a character offset, so motions, text objects,
 * and find targets are testable without a document. Offsets index characters
 * (JavaScript string indices); `null` means the target is not on this line and
 * the caller decides how to continue across lines.
 */

/** Stands in for an inline node such as a chip or image inside a line's text. */
export const OBJECT_CHARACTER = "￼";

export type CharacterClass = "blank" | "punctuation" | "word" | "object";

export type FindKind = "f" | "F" | "t" | "T";

export type TextRange = { from: number; to: number };

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

export function characterClass(character: string | undefined, bigWord = false): CharacterClass {
  if (character === undefined || character === "") return "blank";
  if (character === OBJECT_CHARACTER) return "object";
  if (/\s/u.test(character)) return "blank";
  if (bigWord) return "word";
  return WORD_CHARACTER.test(character) ? "word" : "punctuation";
}

function classAt(text: string, index: number, bigWord: boolean): CharacterClass {
  return characterClass(text[index], bigWord);
}

function sameWord(a: CharacterClass, b: CharacterClass): boolean {
  return a === b && a !== "blank" && a !== "object";
}

/** `w` / `W`: start of the next word on this line. */
export function nextWordStart(text: string, offset: number, bigWord = false): number | null {
  if (offset >= text.length) return null;
  let index = offset;
  const start = classAt(text, index, bigWord);
  if (start === "object") {
    index += 1;
  } else if (start !== "blank") {
    while (index < text.length && sameWord(classAt(text, index, bigWord), start)) index += 1;
  }
  while (index < text.length && classAt(text, index, bigWord) === "blank") index += 1;
  return index < text.length ? index : null;
}

/** `e` / `E`: end of the current or next word on this line. */
export function wordEnd(text: string, offset: number, bigWord = false): number | null {
  let index = offset + 1;
  while (index < text.length && classAt(text, index, bigWord) === "blank") index += 1;
  if (index >= text.length) return null;
  const start = classAt(text, index, bigWord);
  if (start === "object") return index;
  while (index + 1 < text.length && sameWord(classAt(text, index + 1, bigWord), start)) index += 1;
  return index;
}

/** `b` / `B`: start of the current or previous word on this line. */
export function previousWordStart(text: string, offset: number, bigWord = false): number | null {
  let index = Math.min(offset, text.length) - 1;
  while (index >= 0 && classAt(text, index, bigWord) === "blank") index -= 1;
  if (index < 0) return null;
  const start = classAt(text, index, bigWord);
  if (start === "object") return index;
  while (index - 1 >= 0 && sameWord(classAt(text, index - 1, bigWord), start)) index -= 1;
  return index;
}

/** `ge` / `gE`: end of the previous word on this line. */
export function previousWordEnd(text: string, offset: number, bigWord = false): number | null {
  let index = Math.min(offset, text.length) - 1;
  if (index < 0) return null;
  const current = classAt(text, index + 1, bigWord);
  if (current !== "blank" && current !== "object") {
    while (index >= 0 && sameWord(classAt(text, index, bigWord), current)) index -= 1;
  }
  while (index >= 0 && classAt(text, index, bigWord) === "blank") index -= 1;
  return index >= 0 ? index : null;
}

export function firstNonBlank(text: string): number {
  const match = /\S/u.exec(text);
  return match ? match.index : Math.max(0, text.length - 1);
}

export function isBlankLine(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * `f`, `F`, `t`, `T` for one character on this line. `t` and `T` stop one
 * short of the match; a `till` whose match is the very next character does not
 * move, which is what makes `;` after it step to the following occurrence.
 */
export function findCharacter(
  text: string,
  offset: number,
  kind: FindKind,
  character: string,
  count = 1,
): number | null {
  const forward = kind === "f" || kind === "t";
  const till = kind === "t" || kind === "T";
  let index = offset;
  for (let remaining = count; remaining > 0; remaining -= 1) {
    let found = -1;
    if (forward) {
      for (let at = index + 1; at < text.length; at += 1) {
        if (text[at] === character) {
          found = at;
          break;
        }
      }
    } else {
      for (let at = index - 1; at >= 0; at -= 1) {
        if (text[at] === character) {
          found = at;
          break;
        }
      }
    }
    if (found === -1) return null;
    index = found;
  }
  return till ? (forward ? index - 1 : index + 1) : index;
}

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{", ">": "<" };

/** `%`: offset of the bracket matching the one at or after the cursor. */
export function matchingBracket(text: string, offset: number): number | null {
  let index = offset;
  while (index < text.length && !PAIRS[text[index]!] && !CLOSERS[text[index]!]) index += 1;
  if (index >= text.length) return null;
  const character = text[index]!;
  const open = PAIRS[character] ? character : CLOSERS[character]!;
  const close = PAIRS[open]!;
  const forward = character === open;
  let depth = 0;
  for (let at = index; forward ? at < text.length : at >= 0; at += forward ? 1 : -1) {
    if (text[at] === open) depth += forward ? 1 : -1;
    else if (text[at] === close) depth += forward ? -1 : 1;
    if (depth === 0) return at;
  }
  return null;
}

/** `iw`, `aw`, `iW`, `aW`. */
export function wordObject(
  text: string,
  offset: number,
  around: boolean,
  bigWord = false,
): TextRange | null {
  if (text.length === 0) return null;
  const at = Math.min(offset, text.length - 1);
  const kind = classAt(text, at, bigWord);
  let from = at;
  let to = at + 1;
  if (kind !== "object") {
    while (from > 0 && sameWord(classAt(text, from - 1, bigWord), kind)) from -= 1;
    while (to < text.length && sameWord(classAt(text, to, bigWord), kind)) to += 1;
    if (kind === "blank") {
      while (from > 0 && classAt(text, from - 1, bigWord) === "blank") from -= 1;
      while (to < text.length && classAt(text, to, bigWord) === "blank") to += 1;
    }
  }
  if (!around) return { from, to };
  if (kind === "blank") {
    const following = classAt(text, to, bigWord);
    if (following === "object") return { from, to: to + 1 };
    while (to < text.length && sameWord(classAt(text, to, bigWord), following)) to += 1;
    return { from, to };
  }
  let trailing = to;
  while (trailing < text.length && classAt(text, trailing, bigWord) === "blank") trailing += 1;
  if (trailing > to) return { from, to: trailing };
  let leading = from;
  while (leading > 0 && classAt(text, leading - 1, bigWord) === "blank") leading -= 1;
  return { from: leading, to };
}

/** `i"`, `a"`, `i'`, `` a` `` and friends, on this line. */
export function quoteObject(
  text: string,
  offset: number,
  quote: string,
  around: boolean,
): TextRange | null {
  const positions: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === quote && text[index - 1] !== "\\") positions.push(index);
  }
  let open = -1;
  let close = -1;
  for (let index = 0; index + 1 < positions.length; index += 2) {
    const a = positions[index]!;
    const b = positions[index + 1]!;
    if (offset <= b) {
      open = a;
      close = b;
      break;
    }
  }
  if (open === -1) return null;
  if (!around) return { from: open + 1, to: close };
  let to = close + 1;
  while (to < text.length && /\s/u.test(text[to]!)) to += 1;
  if (to > close + 1) return { from: open, to };
  let from = open;
  while (from > 0 && /\s/u.test(text[from - 1]!)) from -= 1;
  return { from, to: close + 1 };
}

/** `i(`, `a[`, `i{`, `a<` and their aliases `b` and `B`, on this line. */
export function bracketObject(
  text: string,
  offset: number,
  open: string,
  around: boolean,
): TextRange | null {
  const close = PAIRS[open];
  if (!close) return null;
  let depth = 0;
  let start = -1;
  for (let index = Math.min(offset, text.length - 1); index >= 0; index -= 1) {
    const character = text[index];
    if (character === close && index !== offset) depth += 1;
    else if (character === open) {
      if (depth === 0) {
        start = index;
        break;
      }
      depth -= 1;
    }
  }
  if (start === -1) return null;
  depth = 0;
  let end = -1;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];
    if (character === open) depth += 1;
    else if (character === close) {
      if (depth === 0) {
        end = index;
        break;
      }
      depth -= 1;
    }
  }
  if (end === -1) return null;
  return around ? { from: start, to: end + 1 } : { from: start + 1, to: end };
}

export function swapCase(text: string): string {
  let result = "";
  for (const character of text) {
    const lower = character.toLowerCase();
    result += character === lower ? character.toUpperCase() : lower;
  }
  return result;
}

/** The number under or after the cursor on this line, for `ctrl-a` / `ctrl-x`. */
export function numberAtOrAfter(
  text: string,
  offset: number,
): { from: number; to: number; value: number } | null {
  const pattern = /-?\d+/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > offset) {
      const signAttached =
        match[0].startsWith("-") &&
        match.index > 0 &&
        characterClass(text[match.index - 1]) === "word";
      const from = signAttached ? match.index + 1 : match.index;
      return { from, to: end, value: Number(text.slice(from, end)) };
    }
  }
  return null;
}

/** The word under or after the cursor for `*` and `#`, or null when the line has none. */
export function wordUnderCursor(text: string, offset: number): TextRange | null {
  let at = offset;
  while (at < text.length && characterClass(text[at]) !== "word") at += 1;
  if (at >= text.length) return null;
  let from = at;
  let to = at + 1;
  while (from > 0 && characterClass(text[from - 1]) === "word") from -= 1;
  while (to < text.length && characterClass(text[to]) === "word") to += 1;
  return { from, to };
}
