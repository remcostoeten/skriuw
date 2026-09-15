import type { FindKind } from "./vim-text";

/**
 * Incremental parser for Vim's normal- and visual-mode command grammar. The
 * plugin re-parses its whole key buffer after every key, so this stays a pure
 * function from keys to either a finished command, a request for more keys,
 * or a rejection that clears the buffer. Insert mode never reaches it.
 */

export type VimOperator = "d" | "c" | "y" | ">" | "<" | "g~" | "gu" | "gU";

export type VimMotion =
  | { kind: "simple"; key: string }
  | { kind: "find"; find: FindKind; character: string }
  | { kind: "search"; pattern: string; backward: boolean }
  | { kind: "textobject"; around: boolean; object: string };

export type VimCommand =
  | { type: "motion"; motion: VimMotion; count: number | null }
  | {
      type: "operator";
      operator: VimOperator;
      /** Null for the doubled linewise form (`dd`, `yy`, `guu`). */
      motion: VimMotion | null;
      count: number | null;
      register: string | null;
    }
  | {
      type: "action";
      action: string;
      count: number | null;
      register: string | null;
      character: string | null;
    };

export type ParseResult =
  | { status: "pending" }
  | { status: "invalid" }
  | { status: "prompt"; prefix: ":" | "/" | "?" }
  | { status: "complete"; command: VimCommand };

export type ParseContext = {
  mode: "normal" | "visual";
  recording: boolean;
};

type MotionParse =
  | { result: "pending" }
  | { result: "invalid" }
  | { result: "complete"; motion: VimMotion; next: number }
  | { result: "prompt"; prefix: "/" | "?" };

const SIMPLE_MOTIONS = new Set([
  "h",
  "j",
  "k",
  "l",
  "w",
  "W",
  "b",
  "B",
  "e",
  "E",
  "0",
  "^",
  "$",
  "G",
  "{",
  "}",
  "%",
  "|",
  "+",
  "-",
  "_",
  "n",
  "N",
  "*",
  "#",
  ";",
  ",",
  "<CR>",
  "<BS>",
  "<Space>",
  "<Left>",
  "<Right>",
  "<Up>",
  "<Down>",
  "<Home>",
  "<End>",
  "<C-d>",
  "<C-u>",
  "<C-f>",
  "<C-b>",
  "<PageUp>",
  "<PageDown>",
]);

const G_MOTIONS = new Set(["g", "e", "E", "j", "k", "_", "0", "$"]);

const FIND_KEYS = new Set(["f", "F", "t", "T"]);

const TEXT_OBJECTS = new Set([
  "w",
  "W",
  "p",
  '"',
  "'",
  "`",
  "(",
  ")",
  "b",
  "[",
  "]",
  "{",
  "}",
  "B",
  "<",
  ">",
]);

const NORMAL_ACTIONS = new Set([
  "i",
  "I",
  "a",
  "A",
  "o",
  "O",
  "x",
  "X",
  "s",
  "S",
  "D",
  "C",
  "Y",
  "p",
  "P",
  "J",
  "u",
  "<C-r>",
  "~",
  ".",
  "v",
  "V",
  "<Esc>",
  "<C-a>",
  "<C-x>",
  "<Del>",
  "&",
]);

const VISUAL_ACTIONS = new Set([
  "d",
  "x",
  "<Del>",
  "c",
  "s",
  "y",
  "D",
  "X",
  "C",
  "S",
  "R",
  "Y",
  ">",
  "<",
  "~",
  "u",
  "U",
  "J",
  "p",
  "P",
  "o",
  "O",
  "v",
  "V",
  "<Esc>",
  "I",
  "A",
]);

const REGISTER_NAMES = /^[a-zA-Z0-9"+*_\-]$/;

function isCountDigit(key: string, first: boolean): boolean {
  return /^[0-9]$/.test(key) && !(first && key === "0");
}

function readCount(keys: readonly string[], at: number): { count: number | null; next: number } {
  let index = at;
  let digits = "";
  while (index < keys.length && isCountDigit(keys[index]!, digits.length === 0)) {
    digits += keys[index];
    index += 1;
  }
  return { count: digits.length > 0 ? Number(digits) : null, next: index };
}

function combineCounts(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 1) * (b ?? 1);
}

function parseMotion(
  keys: readonly string[],
  at: number,
  allowTextObjects: boolean,
): MotionParse {
  const key = keys[at];
  if (key === undefined) return { result: "pending" };
  if (SIMPLE_MOTIONS.has(key)) {
    return { result: "complete", motion: { kind: "simple", key }, next: at + 1 };
  }
  if (key === "g") {
    const second = keys[at + 1];
    if (second === undefined) return { result: "pending" };
    if (G_MOTIONS.has(second)) {
      return { result: "complete", motion: { kind: "simple", key: `g${second}` }, next: at + 2 };
    }
    return { result: "invalid" };
  }
  if (FIND_KEYS.has(key)) {
    const character = keys[at + 1];
    if (character === undefined) return { result: "pending" };
    if (character.length !== 1 && character !== "<Space>") return { result: "invalid" };
    return {
      result: "complete",
      motion: { kind: "find", find: key as FindKind, character: character === "<Space>" ? " " : character },
      next: at + 2,
    };
  }
  if (key === "/" || key === "?") {
    return { result: "prompt", prefix: key };
  }
  if (key.startsWith("<search:")) {
    const backward = key.charAt(8) === "?";
    return {
      result: "complete",
      motion: { kind: "search", pattern: key.slice(9, -1), backward },
      next: at + 1,
    };
  }
  if (allowTextObjects && (key === "i" || key === "a")) {
    const object = keys[at + 1];
    if (object === undefined) return { result: "pending" };
    if (!TEXT_OBJECTS.has(object)) return { result: "invalid" };
    return {
      result: "complete",
      motion: { kind: "textobject", around: key === "a", object },
      next: at + 2,
    };
  }
  return { result: "invalid" };
}

function readOperator(keys: readonly string[], at: number): { operator: VimOperator; next: number } | "pending" | null {
  const key = keys[at];
  if (key === undefined) return "pending";
  if (key === "d" || key === "c" || key === "y" || key === ">" || key === "<") {
    return { operator: key, next: at + 1 };
  }
  if (key === "g") {
    const second = keys[at + 1];
    if (second === undefined) return "pending";
    if (second === "~" || second === "u" || second === "U") {
      return { operator: `g${second}` as VimOperator, next: at + 2 };
    }
  }
  return null;
}

function doubledOperatorEnd(operator: VimOperator, keys: readonly string[], at: number): number | "pending" | null {
  const key = keys[at];
  if (key === undefined) return "pending";
  if (operator.length === 1) return key === operator ? at + 1 : null;
  const suffix = operator.charAt(1);
  if (key === suffix) return at + 1;
  if (key === "g") {
    const second = keys[at + 1];
    if (second === undefined) return "pending";
    return second === suffix ? at + 2 : null;
  }
  return null;
}

function complete(command: VimCommand): ParseResult {
  return { status: "complete", command };
}

function parseNormal(
  keys: readonly string[],
  at: number,
  count: number | null,
  register: string | null,
  context: ParseContext,
): ParseResult {
  const key = keys[at];
  if (key === undefined) return { status: "pending" };
  if (key === ":") return { status: "prompt", prefix: ":" };
  const operator = readOperator(keys, at);
  if (operator === "pending") return { status: "pending" };
  if (operator) {
    const { count: innerCount, next } = readCount(keys, operator.next);
    const doubled = doubledOperatorEnd(operator.operator, keys, next);
    if (doubled === "pending") return { status: "pending" };
    if (typeof doubled === "number") {
      if (doubled !== keys.length) return { status: "invalid" };
      return complete({
        type: "operator",
        operator: operator.operator,
        motion: null,
        count: combineCounts(count, innerCount),
        register,
      });
    }
    const motion = parseMotion(keys, next, true);
    if (motion.result === "pending") return { status: "pending" };
    if (motion.result === "invalid") return { status: "invalid" };
    if (motion.result === "prompt") return { status: "prompt", prefix: motion.prefix };
    if (motion.next !== keys.length) return { status: "invalid" };
    return complete({
      type: "operator",
      operator: operator.operator,
      motion: motion.motion,
      count: combineCounts(count, innerCount),
      register,
    });
  }
  if (key === "r") {
    const character = keys[at + 1];
    if (character === undefined) return { status: "pending" };
    if (character.length !== 1 && character !== "<Space>" && character !== "<CR>") return { status: "invalid" };
    if (at + 2 !== keys.length) return { status: "invalid" };
    return complete({
      type: "action",
      action: "replace",
      count,
      register,
      character: character === "<Space>" ? " " : character === "<CR>" ? "\n" : character,
    });
  }
  if (key === "q") {
    if (context.recording) {
      return at + 1 === keys.length
        ? complete({ type: "action", action: "stopRecording", count, register, character: null })
        : { status: "invalid" };
    }
    const name = keys[at + 1];
    if (name === undefined) return { status: "pending" };
    if (!/^[a-zA-Z0-9]$/.test(name) || at + 2 !== keys.length) return { status: "invalid" };
    return complete({ type: "action", action: "startRecording", count, register, character: name });
  }
  if (key === "@") {
    const name = keys[at + 1];
    if (name === undefined) return { status: "pending" };
    if (!/^[a-zA-Z0-9@]$/.test(name) || at + 2 !== keys.length) return { status: "invalid" };
    return complete({ type: "action", action: "playMacro", count, register, character: name });
  }
  if (key === "g" || key === "z" || key === "Z") {
    const second = keys[at + 1];
    if (second === undefined) return { status: "pending" };
    if (at + 2 !== keys.length) return { status: "invalid" };
    if (key === "g") {
      if (G_MOTIONS.has(second)) {
        return complete({ type: "motion", motion: { kind: "simple", key: `g${second}` }, count });
      }
      if (second === "v" || second === "J" || second === "p" || second === "P" || second === "i") {
        return complete({ type: "action", action: `g${second}`, count, register, character: null });
      }
      return { status: "invalid" };
    }
    if (key === "z") {
      if (second === "z" || second === "t" || second === "b" || second === "." || second === "<CR>" || second === "-") {
        return complete({ type: "action", action: `z${second}`, count, register, character: null });
      }
      return { status: "invalid" };
    }
    if (second === "Z") return complete({ type: "action", action: "ZZ", count, register, character: null });
    return { status: "invalid" };
  }
  if (NORMAL_ACTIONS.has(key)) {
    if (at + 1 !== keys.length) return { status: "invalid" };
    return complete({ type: "action", action: key, count, register, character: null });
  }
  const motion = parseMotion(keys, at, false);
  if (motion.result === "pending") return { status: "pending" };
  if (motion.result === "invalid") return { status: "invalid" };
  if (motion.result === "prompt") return { status: "prompt", prefix: motion.prefix };
  if (motion.next !== keys.length) return { status: "invalid" };
  return complete({ type: "motion", motion: motion.motion, count });
}

function parseVisual(
  keys: readonly string[],
  at: number,
  count: number | null,
  register: string | null,
): ParseResult {
  const key = keys[at];
  if (key === undefined) return { status: "pending" };
  if (key === ":") return { status: "prompt", prefix: ":" };
  if (key === "r") {
    const character = keys[at + 1];
    if (character === undefined) return { status: "pending" };
    if (character.length !== 1 && character !== "<Space>") return { status: "invalid" };
    if (at + 2 !== keys.length) return { status: "invalid" };
    return complete({
      type: "action",
      action: "replace",
      count,
      register,
      character: character === "<Space>" ? " " : character,
    });
  }
  if (key === "g") {
    const second = keys[at + 1];
    if (second === undefined) return { status: "pending" };
    if (at + 2 !== keys.length) return { status: "invalid" };
    if (G_MOTIONS.has(second)) {
      return complete({ type: "motion", motion: { kind: "simple", key: `g${second}` }, count });
    }
    if (second === "~" || second === "u" || second === "U" || second === "v" || second === "J") {
      return complete({ type: "action", action: `g${second}`, count, register, character: null });
    }
    return { status: "invalid" };
  }
  if (key === "z") {
    const second = keys[at + 1];
    if (second === undefined) return { status: "pending" };
    if (at + 2 !== keys.length) return { status: "invalid" };
    if (second === "z" || second === "t" || second === "b") {
      return complete({ type: "action", action: `z${second}`, count, register, character: null });
    }
    return { status: "invalid" };
  }
  if (VISUAL_ACTIONS.has(key)) {
    if (at + 1 !== keys.length) return { status: "invalid" };
    return complete({ type: "action", action: key, count, register, character: null });
  }
  const motion = parseMotion(keys, at, true);
  if (motion.result === "pending") return { status: "pending" };
  if (motion.result === "invalid") return { status: "invalid" };
  if (motion.result === "prompt") return { status: "prompt", prefix: motion.prefix };
  if (motion.next !== keys.length) return { status: "invalid" };
  return complete({ type: "motion", motion: motion.motion, count });
}

export function parseVimKeys(keys: readonly string[], context: ParseContext): ParseResult {
  let at = 0;
  let register: string | null = null;
  if (keys[at] === '"') {
    const name = keys[at + 1];
    if (name === undefined) return { status: "pending" };
    if (!REGISTER_NAMES.test(name)) return { status: "invalid" };
    register = name;
    at += 2;
  }
  const { count, next } = readCount(keys, at);
  if (next >= keys.length) return { status: "pending" };
  return context.mode === "visual"
    ? parseVisual(keys, next, count, register)
    : parseNormal(keys, next, count, register, context);
}

/** Human-readable pending keys for the status line, e.g. `"a3d`. */
export function describePendingKeys(keys: readonly string[]): string {
  return keys.map((key) => (key === "<Space>" ? "␣" : key)).join("");
}
