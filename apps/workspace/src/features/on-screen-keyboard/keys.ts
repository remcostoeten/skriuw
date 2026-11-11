export type KeyKind = "char" | "mod" | "act";

export type KeyShape = "letter" | "pair" | "single";

export type Latch = "shift" | "caps" | "ctrl" | "alt" | "meta" | "numlock" | "scroll";

export type KeyDefinition = {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: KeyKind;
  shape: KeyShape;
  label: string;
  base: string;
  shifted: string;
  top: string | null;
  latch: Latch | null;
  spoken: string;
};

export const LATCH_LABELS: Record<Latch, string> = {
  shift: "Shift",
  caps: "Caps Lock",
  ctrl: "Control",
  alt: "Alt",
  meta: "Super",
  numlock: "Num Lock",
  scroll: "Scroll Lock",
};

export const LATCH_ORDER: readonly Latch[] = [
  "shift",
  "ctrl",
  "alt",
  "meta",
  "caps",
  "numlock",
  "scroll",
];

const WIDTHS: Record<string, number> = {
  Backspace: 2,
  Tab: 1.5,
  CapsLock: 1.75,
  Enter: 2.25,
  ShiftLeft: 2.25,
  ShiftRight: 2.75,
  Backslash: 1.5,
  Space: 6.25,
  ControlLeft: 1.25,
  MetaLeft: 1.25,
  AltLeft: 1.25,
  AltRight: 1.25,
  MetaRight: 1.25,
  ContextMenu: 1.25,
  ControlRight: 1.25,
};

const PAIRS: Record<string, readonly [string, string]> = {
  Backquote: ["`", "~"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backslash: ["\\", "|"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
};

const NAMES: Record<string, string> = {
  Backspace: "Backspace",
  Tab: "Tab",
  CapsLock: "Caps",
  Enter: "Enter",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  MetaLeft: "Super",
  MetaRight: "Super",
  AltLeft: "Alt",
  AltRight: "Alt",
  ContextMenu: "Menu",
  Delete: "Del",
  Escape: "Esc",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  Pause: "Pause",
  Insert: "Ins",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  NumLock: "Num",
  NumpadEnter: "Enter",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

const NUMPAD_CHARACTERS: Record<string, string> = {
  NumpadDivide: "/",
  NumpadMultiply: "*",
  NumpadSubtract: "-",
  NumpadAdd: "+",
  NumpadDecimal: ".",
};

const NUMPAD_SECONDARY: Record<string, string> = {
  Numpad7: "Home",
  Numpad8: "↑",
  Numpad9: "PgUp",
  Numpad4: "←",
  Numpad6: "→",
  Numpad1: "End",
  Numpad2: "↓",
  Numpad3: "PgDn",
  Numpad0: "Ins",
  NumpadDecimal: "Del",
};

const SPOKEN_SECONDARY: Record<string, string> = {
  "↑": "Arrow Up",
  "↓": "Arrow Down",
  "←": "Arrow Left",
  "→": "Arrow Right",
  Ins: "Insert",
  Del: "Delete",
  PgUp: "Page Up",
  PgDn: "Page Down",
};

const SPOKEN_CHARACTERS: Record<string, string> = {
  "`": "grave accent",
  "~": "tilde",
  "!": "exclamation mark",
  "@": "at sign",
  "#": "number sign",
  $: "dollar sign",
  "%": "percent sign",
  "^": "caret",
  "&": "ampersand",
  "*": "asterisk",
  "(": "left parenthesis",
  ")": "right parenthesis",
  "-": "minus",
  _: "underscore",
  "=": "equals",
  "+": "plus",
  "[": "left bracket",
  "{": "left brace",
  "]": "right bracket",
  "}": "right brace",
  "\\": "backslash",
  "|": "vertical bar",
  ";": "semicolon",
  ":": "colon",
  "'": "apostrophe",
  '"': "quotation mark",
  ",": "comma",
  "<": "less than",
  ".": "period",
  ">": "greater than",
  "/": "slash",
  "?": "question mark",
};

const LATCH_BY_CODE: Record<string, Latch> = {
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "ctrl",
  ControlRight: "ctrl",
  AltLeft: "alt",
  AltRight: "alt",
  MetaLeft: "meta",
  MetaRight: "meta",
  CapsLock: "caps",
  NumLock: "numlock",
  ScrollLock: "scroll",
};

const CORE_ROWS = [
  "Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backspace",
  "Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash",
  "CapsLock KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Enter",
  "ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight",
  "ControlLeft MetaLeft AltLeft Space AltRight MetaRight ContextMenu ControlRight",
];

type Block = readonly [number, number, string];

const FULL_SIZE_BLOCKS: readonly Block[] = [
  [0, 0, "Escape 1 F1 F2 F3 F4 0.5 F5 F6 F7 F8 0.5 F9 F10 F11 F12"],
  [15.5, 0, "PrintScreen ScrollLock Pause"],
  ...CORE_ROWS.map((row, index): Block => [0, 1.5 + index, row]),
  [15.5, 1.5, "Insert Home PageUp"],
  [15.5, 2.5, "Delete End PageDown"],
  [15.5, 4.5, "1 ArrowUp"],
  [15.5, 5.5, "ArrowLeft ArrowDown ArrowRight"],
  [19, 1.5, "NumLock NumpadDivide NumpadMultiply NumpadSubtract"],
  [19, 2.5, "Numpad7 Numpad8 Numpad9 NumpadAdd:1x2"],
  [19, 3.5, "Numpad4 Numpad5 Numpad6"],
  [19, 4.5, "Numpad1 Numpad2 Numpad3 NumpadEnter:1x2"],
  [19, 5.5, "Numpad0:2 NumpadDecimal"],
];

function group(match: RegExpExecArray, index: number): string {
  return match[index] ?? "";
}

function spokenCharacter(character: string): string {
  return SPOKEN_CHARACTERS[character] ?? character;
}

const SHIFTED_DIGITS = ")!@#$%^&*(";

function spokenName(code: string, shape: KeyShape, label: string, secondary: string | null) {
  if (shape === "letter") {
    return `letter ${label}`;
  }
  const digit = /^Numpad(\d)$/.exec(code);
  if (digit) {
    const base = `Numpad ${group(digit, 1)}`;
    return secondary
      ? `${base}, ${SPOKEN_SECONDARY[secondary] ?? secondary} with Num Lock off`
      : base;
  }
  if (code === "NumpadDecimal") {
    return "Numpad decimal point, Delete with Num Lock off";
  }
  const side = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (side) {
    const modifier = group(side, 1);
    return `${group(side, 2)} ${modifier === "Meta" ? "Super" : modifier}`;
  }
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function describeKey(code: string): Omit<KeyDefinition, "x" | "y" | "width" | "height"> {
  const latch = LATCH_BY_CODE[code] ?? null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    const name = group(letter, 1);
    return {
      code,
      kind: "char",
      shape: "letter",
      label: name,
      base: name.toLowerCase(),
      shifted: name,
      top: null,
      latch,
      spoken: spokenName(code, "letter", name, null),
    };
  }
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) {
    const number = group(digit, 1);
    const shifted = SHIFTED_DIGITS.charAt(Number(number));
    return {
      code,
      kind: "char",
      shape: "pair",
      label: number,
      base: number,
      shifted,
      top: shifted,
      latch,
      spoken: `${number}, shifted ${spokenCharacter(shifted)}`,
    };
  }
  const pair = PAIRS[code];
  if (pair) {
    return {
      code,
      kind: "char",
      shape: "pair",
      label: pair[0],
      base: pair[0],
      shifted: pair[1],
      top: pair[1],
      latch,
      spoken: `${spokenCharacter(pair[0])}, shifted ${spokenCharacter(pair[1])}`,
    };
  }
  const numpadDigit = /^Numpad(\d)$/.exec(code);
  const numpadCharacter = NUMPAD_CHARACTERS[code];
  if (numpadDigit || numpadCharacter) {
    const character = numpadDigit ? group(numpadDigit, 1) : (numpadCharacter ?? "");
    const secondary = NUMPAD_SECONDARY[code] ?? null;
    return {
      code,
      kind: "char",
      shape: "single",
      label: character,
      base: character,
      shifted: character,
      top: secondary,
      latch,
      spoken: spokenName(code, "single", character, secondary),
    };
  }
  if (code === "Space") {
    return {
      code,
      kind: "char",
      shape: "single",
      label: "",
      base: " ",
      shifted: " ",
      top: null,
      latch,
      spoken: "Space",
    };
  }
  const label = NAMES[code] ?? code;
  return {
    code,
    kind: latch ? "mod" : "act",
    shape: "single",
    label,
    base: "",
    shifted: "",
    top: null,
    latch,
    spoken: spokenName(code, "single", label, null),
  };
}

function layoutBlocks(blocks: readonly Block[]): KeyDefinition[] {
  const keys: KeyDefinition[] = [];
  for (const [startX, y, spec] of blocks) {
    let x = startX;
    for (const token of spec.split(" ")) {
      if (/^[\d.]+$/.test(token)) {
        x += Number(token);
        continue;
      }
      const [code = "", size] = token.split(":");
      let width = WIDTHS[code] ?? 1;
      let height = 1;
      if (size) {
        const [sizeWidth = "1", sizeHeight] = size.split("x");
        width = Number(sizeWidth);
        if (sizeHeight) {
          height = Number(sizeHeight);
        }
      }
      keys.push({ ...describeKey(code), x, y, width, height });
      x += width;
    }
  }
  return keys;
}

/**
 * @name FULL_SIZE_KEYS
 * @description The 104 keys of the full-size layout: function row, main block,
 * navigation cluster, and numpad, positioned in key-width units.
 *
 * @example
 * for (const key of FULL_SIZE_KEYS) place(key.code, key.x, key.y);
 */
export const FULL_SIZE_KEYS: readonly KeyDefinition[] = layoutBlocks(FULL_SIZE_BLOCKS);

/**
 * @name boardExtent
 * @description Width and height of a layout in key-width units.
 *
 * @example
 * const { width, height } = boardExtent(FULL_SIZE_KEYS);
 */
export function boardExtent(keys: readonly KeyDefinition[]): { width: number; height: number } {
  return {
    width: Math.max(...keys.map((key) => key.x + key.width)),
    height: Math.max(...keys.map((key) => key.y + key.height)),
  };
}

/**
 * @name nearestKey
 * @description Finds the key closest to `from` in an arrow direction, weighting
 * sideways distance so a move stays in its row or column.
 *
 * @example
 * const next = nearestKey(keys, current, [1, 0]);
 */
export function nearestKey(
  keys: readonly KeyDefinition[],
  from: KeyDefinition,
  direction: readonly [number, number],
): KeyDefinition | null {
  const [dx, dy] = direction;
  const centreX = from.x + from.width / 2;
  const centreY = from.y + from.height / 2;
  let best: KeyDefinition | null = null;
  let bestScore = Infinity;
  for (const key of keys) {
    if (key === from) {
      continue;
    }
    const offsetX = key.x + key.width / 2 - centreX;
    const offsetY = key.y + key.height / 2 - centreY;
    const along = dx ? offsetX * dx : offsetY * dy;
    if (along <= 0.01) {
      continue;
    }
    const across = dx ? Math.abs(offsetY) : Math.abs(offsetX);
    const score = along + across * 2.5;
    if (score < bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}
