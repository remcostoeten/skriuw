import assert from "node:assert/strict";
import { test } from "vitest";
import { FULL_SIZE_KEYS } from "@/features/on-screen-keyboard/keys";
import { INITIAL_LATCHES, keyCodeFor, pressKey } from "@/features/on-screen-keyboard/press";
import type { Latches } from "@/features/on-screen-keyboard/press";

function key(code: string) {
  const found = FULL_SIZE_KEYS.find((candidate) => candidate.code === code);
  assert.ok(found, `missing key ${code}`);
  return found;
}

function latched(overrides: Partial<Latches>): Latches {
  return { ...INITIAL_LATCHES, ...overrides };
}

test("a letter sends its lowercase character and text", () => {
  const result = pressKey(INITIAL_LATCHES, key("KeyH"));
  assert.equal(result.stroke?.key, "h");
  assert.equal(result.stroke?.text, "h");
  assert.equal(result.stroke?.code, "KeyH");
  assert.equal(result.stroke?.keyCode, 72);
  assert.equal(result.stroke?.shiftKey, false);
});

test("shift applies to the next key only", () => {
  const afterShift = pressKey(INITIAL_LATCHES, key("ShiftLeft"));
  assert.equal(afterShift.latches.shift, true);
  assert.equal(afterShift.announcement, "Shift on");
  assert.equal(afterShift.stroke, null);
  const typed = pressKey(afterShift.latches, key("KeyA"));
  assert.equal(typed.stroke?.text, "A");
  assert.equal(typed.stroke?.shiftKey, true);
  assert.equal(typed.latches.shift, false);
});

test("shift selects the shifted symbol on a pair key", () => {
  const result = pressKey(latched({ shift: true }), key("Digit1"));
  assert.equal(result.stroke?.key, "!");
  assert.equal(result.stroke?.text, "!");
  assert.equal(result.stroke?.shiftKey, true);
});

test("caps lock uppercases letters, stays on, and shift inverts it", () => {
  const caps = pressKey(INITIAL_LATCHES, key("CapsLock"));
  assert.equal(caps.latches.caps, true);
  assert.equal(caps.announcement, "Caps Lock on");
  const typed = pressKey(caps.latches, key("KeyA"));
  assert.equal(typed.stroke?.text, "A");
  assert.equal(typed.stroke?.shiftKey, false);
  assert.equal(typed.latches.caps, true);
  const inverted = pressKey(latched({ caps: true, shift: true }), key("KeyA"));
  assert.equal(inverted.stroke?.text, "a");
});

test("caps lock does not change a pair key", () => {
  const result = pressKey(latched({ caps: true }), key("Digit1"));
  assert.equal(result.stroke?.text, "1");
});

test("a latched control makes a shortcut and drops the text", () => {
  const result = pressKey(latched({ ctrl: true }), key("KeyB"));
  assert.equal(result.stroke?.ctrlKey, true);
  assert.equal(result.stroke?.key, "b");
  assert.equal(result.stroke?.text, null);
  assert.equal(result.latches.ctrl, false);
});

test("named keys send their key name and no text", () => {
  const enter = pressKey(INITIAL_LATCHES, key("Enter"));
  assert.equal(enter.stroke?.key, "Enter");
  assert.equal(enter.stroke?.text, null);
  assert.equal(enter.stroke?.keyCode, 13);
  assert.equal(pressKey(INITIAL_LATCHES, key("NumpadEnter")).stroke?.key, "Enter");
  assert.equal(pressKey(INITIAL_LATCHES, key("F5")).stroke?.keyCode, 116);
  assert.equal(pressKey(INITIAL_LATCHES, key("Backspace")).stroke?.key, "Backspace");
});

test("space types a space", () => {
  const result = pressKey(INITIAL_LATCHES, key("Space"));
  assert.equal(result.stroke?.key, " ");
  assert.equal(result.stroke?.text, " ");
});

test("the numpad types digits and operators while Num Lock is on", () => {
  assert.equal(pressKey(INITIAL_LATCHES, key("Numpad7")).stroke?.text, "7");
  assert.equal(pressKey(INITIAL_LATCHES, key("NumpadAdd")).stroke?.text, "+");
  assert.equal(pressKey(INITIAL_LATCHES, key("Numpad7")).stroke?.keyCode, 103);
});

test("the numpad navigates while Num Lock is off", () => {
  const off = latched({ numlock: false });
  assert.equal(pressKey(off, key("Numpad7")).stroke?.key, "Home");
  assert.equal(pressKey(off, key("Numpad4")).stroke?.key, "ArrowLeft");
  assert.equal(pressKey(off, key("Numpad9")).stroke?.key, "PageUp");
  assert.equal(pressKey(off, key("NumpadDecimal")).stroke?.key, "Delete");
  assert.equal(pressKey(off, key("Numpad5")).stroke, null);
  assert.equal(pressKey(off, key("Numpad7")).stroke?.text, null);
});

test("num lock toggles and is announced", () => {
  const result = pressKey(INITIAL_LATCHES, key("NumLock"));
  assert.equal(result.latches.numlock, false);
  assert.equal(result.announcement, "Num Lock off");
});

test("scroll lock turns the up and down arrows into scrolling", () => {
  const on = pressKey(INITIAL_LATCHES, key("ScrollLock")).latches;
  assert.equal(on.scroll, true);
  const up = pressKey(on, key("ArrowUp"));
  assert.equal(up.stroke, null);
  assert.equal(up.scroll, -1);
  assert.equal(pressKey(on, key("ArrowDown")).scroll, 1);
  const left = pressKey(on, key("ArrowLeft"));
  assert.equal(left.stroke, null);
  assert.equal(left.scroll, 0);
});

test("arrows move normally with scroll lock off", () => {
  const result = pressKey(INITIAL_LATCHES, key("ArrowUp"));
  assert.equal(result.stroke?.key, "ArrowUp");
  assert.equal(result.scroll, 0);
});

test("a press without latches keeps the same latch object", () => {
  const result = pressKey(INITIAL_LATCHES, key("KeyA"));
  assert.equal(result.latches, INITIAL_LATCHES);
});

test("key codes cover letters, digits, function keys and punctuation", () => {
  assert.equal(keyCodeFor("KeyZ"), 90);
  assert.equal(keyCodeFor("Digit0"), 48);
  assert.equal(keyCodeFor("Numpad0"), 96);
  assert.equal(keyCodeFor("F12"), 123);
  assert.equal(keyCodeFor("Slash"), 191);
  assert.equal(keyCodeFor("Unknown"), 0);
});
