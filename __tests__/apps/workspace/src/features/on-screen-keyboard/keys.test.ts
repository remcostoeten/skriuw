import assert from "node:assert/strict";
import { test } from "vitest";
import { FULL_SIZE_KEYS, boardExtent, nearestKey } from "@/features/on-screen-keyboard/keys";

function key(code: string) {
  const found = FULL_SIZE_KEYS.find((candidate) => candidate.code === code);
  assert.ok(found, `missing key ${code}`);
  return found;
}

test("the full-size layout has 104 distinct keys", () => {
  assert.equal(FULL_SIZE_KEYS.length, 104);
  assert.equal(new Set(FULL_SIZE_KEYS.map((candidate) => candidate.code)).size, 104);
});

test("the board spans the main block, navigation cluster and numpad", () => {
  assert.deepEqual(boardExtent(FULL_SIZE_KEYS), { width: 23, height: 6.5 });
});

test("no two keys overlap", () => {
  for (const [index, first] of FULL_SIZE_KEYS.entries()) {
    for (const second of FULL_SIZE_KEYS.slice(index + 1)) {
      const overlapX =
        first.x < second.x + second.width - 0.001 && second.x < first.x + first.width - 0.001;
      const overlapY =
        first.y < second.y + second.height - 0.001 && second.y < first.y + first.height - 0.001;
      assert.equal(overlapX && overlapY, false, `${first.code} overlaps ${second.code}`);
    }
  }
});

test("letters carry a lowercase base and an uppercase shifted character", () => {
  const a = key("KeyA");
  assert.equal(a.base, "a");
  assert.equal(a.shifted, "A");
  assert.equal(a.shape, "letter");
});

test("number and punctuation keys pair a base with a shifted symbol", () => {
  assert.equal(key("Digit1").shifted, "!");
  assert.equal(key("Digit0").shifted, ")");
  assert.equal(key("Slash").shifted, "?");
  assert.equal(key("Digit1").spoken, "1, shifted exclamation mark");
});

test("modifier and lock keys are latches, other named keys are not", () => {
  assert.equal(key("ShiftLeft").latch, "shift");
  assert.equal(key("CapsLock").latch, "caps");
  assert.equal(key("NumLock").latch, "numlock");
  assert.equal(key("ScrollLock").latch, "scroll");
  assert.equal(key("Enter").latch, null);
  assert.equal(key("Insert").latch, null);
});

test("numpad keys show their navigation legend and say it when spoken", () => {
  assert.equal(key("Numpad7").top, "Home");
  assert.equal(key("Numpad5").top, null);
  assert.equal(key("Numpad7").spoken, "Numpad 7, Home with Num Lock off");
  assert.equal(key("NumpadDecimal").top, "Del");
});

test("modifier keys are spoken with their side", () => {
  assert.equal(key("ShiftLeft").spoken, "Left Shift");
  assert.equal(key("MetaRight").spoken, "Right Super");
});

test("arrow navigation moves between neighbouring keys", () => {
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("KeyG"), [1, 0])?.code, "KeyH");
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("KeyG"), [-1, 0])?.code, "KeyF");
  assert.ok(["KeyV", "KeyB"].includes(nearestKey(FULL_SIZE_KEYS, key("KeyG"), [0, 1])?.code ?? ""));
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("KeyG"), [0, -1])?.code, "KeyT");
});

test("arrow navigation stops at the board edge", () => {
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("Escape"), [0, -1]), null);
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("NumpadEnter"), [1, 0]), null);
});

test("the tall numpad keys are reachable from both rows they span", () => {
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("Numpad9"), [1, 0])?.code, "NumpadAdd");
  assert.equal(nearestKey(FULL_SIZE_KEYS, key("Numpad6"), [1, 0])?.code, "NumpadAdd");
});
