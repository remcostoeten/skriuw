import { LATCH_LABELS } from "./keys";
import type { KeyDefinition, Latch } from "./keys";

export type Latches = Record<Latch, boolean>;

export type Stroke = {
  key: string;
  code: string;
  keyCode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  text: string | null;
};

export type PressResult = {
  latches: Latches;
  stroke: Stroke | null;
  announcement: string | null;
  scroll: -1 | 0 | 1;
};

export const INITIAL_LATCHES: Latches = {
  shift: false,
  caps: false,
  ctrl: false,
  alt: false,
  meta: false,
  numlock: true,
  scroll: false,
};

const NUMPAD_NAVIGATION: Record<string, string> = {
  Numpad7: "Home",
  Numpad8: "ArrowUp",
  Numpad9: "PageUp",
  Numpad4: "ArrowLeft",
  Numpad6: "ArrowRight",
  Numpad1: "End",
  Numpad2: "ArrowDown",
  Numpad3: "PageDown",
  Numpad0: "Insert",
  NumpadDecimal: "Delete",
};

const NAMED_KEY_CODES: Record<string, number> = {
  Backspace: 8,
  Tab: 9,
  Enter: 13,
  NumpadEnter: 13,
  Pause: 19,
  Escape: 27,
  Space: 32,
  PageUp: 33,
  PageDown: 34,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  PrintScreen: 44,
  Insert: 45,
  Delete: 46,
  ContextMenu: 93,
  NumpadMultiply: 106,
  NumpadAdd: 107,
  NumpadSubtract: 109,
  NumpadDecimal: 110,
  NumpadDivide: 111,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
};

/**
 * @name keyCodeFor
 * @description The legacy `keyCode` for a physical key code. Editors that still
 * read `keyCode` need it on a synthesised keydown to match their bindings.
 *
 * @example
 * keyCodeFor("KeyA"); // 65
 */
export function keyCodeFor(code: string): number {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return (letter[1] ?? "").charCodeAt(0);
  }
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) {
    const value = Number(digit[1]);
    return code.startsWith("Numpad") ? 96 + value : 48 + value;
  }
  const functionKey = /^F(\d{1,2})$/.exec(code);
  if (functionKey) {
    return 111 + Number(functionKey[1]);
  }
  return NAMED_KEY_CODES[code] ?? 0;
}

function namedKey(code: string): string {
  return code === "NumpadEnter" ? "Enter" : code;
}

function consumeOneShots(latches: Latches): Latches {
  if (!latches.shift && !latches.ctrl && !latches.alt && !latches.meta) {
    return latches;
  }
  return { ...latches, shift: false, ctrl: false, alt: false, meta: false };
}

function strokeFor(
  latches: Latches,
  code: string,
  key: string,
  text: string | null,
  shiftKey: boolean,
): Stroke {
  return {
    key,
    code,
    keyCode: keyCodeFor(code),
    shiftKey,
    ctrlKey: latches.ctrl,
    altKey: latches.alt,
    metaKey: latches.meta,
    text: latches.ctrl || latches.alt || latches.meta ? null : text,
  };
}

function toggledLatch(latches: Latches, latch: Latch): PressResult {
  const next = { ...latches, [latch]: !latches[latch] };
  return {
    latches: next,
    stroke: null,
    announcement: `${LATCH_LABELS[latch]} ${next[latch] ? "on" : "off"}`,
    scroll: 0,
  };
}

/**
 * @name pressKey
 * @description Turns one press of an on-screen key into the keystroke to
 * deliver and the next latch state. Shift, Control, Alt and Super apply to the
 * next key only; Caps Lock, Num Lock and Scroll Lock stay until pressed again.
 * With Num Lock off the numpad keys send navigation keys instead of digits,
 * and with Scroll Lock on the up and down arrows ask to scroll instead.
 *
 * @example
 * const result = pressKey(INITIAL_LATCHES, key);
 * if (result.stroke) deliver(result.stroke);
 */
export function pressKey(latches: Latches, key: KeyDefinition): PressResult {
  if (key.latch) {
    return toggledLatch(latches, key.latch);
  }
  if (!latches.numlock && key.code === "Numpad5") {
    return { latches, stroke: null, announcement: null, scroll: 0 };
  }
  const remapped = latches.numlock ? undefined : NUMPAD_NAVIGATION[key.code];
  if (remapped) {
    return pressNamed(latches, remapped, remapped);
  }
  if (key.kind === "char") {
    return pressCharacter(latches, key);
  }
  return pressNamed(latches, key.code, namedKey(key.code));
}

function pressCharacter(latches: Latches, key: KeyDefinition): PressResult {
  const letter = key.shape === "letter";
  const upper = letter ? latches.shift !== latches.caps : latches.shift;
  const character = upper ? key.shifted : key.base;
  const shiftKey = letter ? latches.shift : latches.shift && key.shifted !== key.base;
  return {
    latches: consumeOneShots(latches),
    stroke: strokeFor(latches, key.code, character, character, shiftKey),
    announcement: null,
    scroll: 0,
  };
}

function pressNamed(latches: Latches, code: string, key: string): PressResult {
  if (latches.scroll && (key === "ArrowUp" || key === "ArrowDown")) {
    return { latches, stroke: null, announcement: null, scroll: key === "ArrowUp" ? -1 : 1 };
  }
  if (latches.scroll && (key === "ArrowLeft" || key === "ArrowRight")) {
    return { latches, stroke: null, announcement: null, scroll: 0 };
  }
  return {
    latches: consumeOneShots(latches),
    stroke: strokeFor(latches, code, key, null, latches.shift),
    announcement: null,
    scroll: 0,
  };
}
