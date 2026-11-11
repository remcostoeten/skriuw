import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  DEFAULT_OPTIONS,
  keyboardUnit,
  parseKeyboardOptions,
  readKeyboardOpen,
  readKeyboardOptions,
  serializeKeyboardOptions,
  writeKeyboardOpen,
  writeKeyboardOptions,
} from "@/features/on-screen-keyboard/preferences";

const globalWithWindow = globalThis as unknown as { window?: unknown };
const originalWindow = globalWithWindow.window;

afterEach(() => {
  globalWithWindow.window = originalWindow;
});

function installStorage(): Map<string, string> {
  const values = new Map<string, string>();
  globalWithWindow.window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  };
  return values;
}

test("the keyboard is closed by default and remembers being open", () => {
  installStorage();
  assert.equal(readKeyboardOpen(), false);
  writeKeyboardOpen(true);
  assert.equal(readKeyboardOpen(), true);
  writeKeyboardOpen(false);
  assert.equal(readKeyboardOpen(), false);
});

test("storage failures leave the keyboard closed and do not throw", () => {
  globalWithWindow.window = {
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    },
  };
  assert.equal(readKeyboardOpen(), false);
  assert.deepEqual(readKeyboardOptions(), DEFAULT_OPTIONS);
  writeKeyboardOpen(true);
  writeKeyboardOptions(DEFAULT_OPTIONS);
});

test("options round trip through storage", () => {
  installStorage();
  const options = { size: "large" as const, dwell: true, dwellMs: 1500, release: true };
  writeKeyboardOptions(options);
  assert.deepEqual(readKeyboardOptions(), options);
});

test("options serialize compactly", () => {
  assert.equal(serializeKeyboardOptions(DEFAULT_OPTIONS), "auto,0,1000,0");
});

test("stored options outside the allowed choices fall back field by field", () => {
  assert.deepEqual(parseKeyboardOptions(null), DEFAULT_OPTIONS);
  assert.deepEqual(parseKeyboardOptions("huge,1,12,1"), {
    size: "auto",
    dwell: true,
    dwellMs: 1000,
    release: true,
  });
  assert.deepEqual(parseKeyboardOptions("xlarge,0,600,0"), {
    size: "xlarge",
    dwell: false,
    dwellMs: 600,
    release: false,
  });
  assert.deepEqual(parseKeyboardOptions(""), DEFAULT_OPTIONS);
});

test("key size fits the width within 26 and 42 pixels, or is fixed", () => {
  assert.equal(keyboardUnit("auto", 2400, 23), 42);
  assert.equal(keyboardUnit("auto", 600, 23), 26);
  assert.equal(keyboardUnit("auto", 1000, 23), 40);
  assert.equal(keyboardUnit("large", 600, 23), 60);
  assert.equal(keyboardUnit("xlarge", 3000, 23), 78);
});
