import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  escapeExitsFocusMode,
  focusModeActive,
  focusModeAnnouncement,
  readFocusMode,
  writeFocusMode,
  type FocusEscapeEvent,
} from "@/shell/focus-mode-model";

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

function escape(overrides: Partial<FocusEscapeEvent> = {}): FocusEscapeEvent {
  return {
    key: "Escape",
    defaultPrevented: false,
    isComposing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

test("focus mode survives a restart through local storage and defaults to off", () => {
  const values = installStorage();
  assert.equal(readFocusMode(), false);
  writeFocusMode(true);
  assert.equal(readFocusMode(), true);
  writeFocusMode(false);
  assert.equal(readFocusMode(), false);
  assert.equal(values.size, 0);
});

test("unreadable storage leaves focus mode off instead of throwing", () => {
  globalWithWindow.window = {
    localStorage: {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    },
  };
  assert.equal(readFocusMode(), false);
  assert.doesNotThrow(() => writeFocusMode(true));
});

test("focus mode only hides chrome on the notes route", () => {
  assert.equal(focusModeActive(true, "notes"), true);
  assert.equal(focusModeActive(false, "notes"), false);
  assert.equal(focusModeActive(true, "journal"), false);
  assert.equal(focusModeActive(true, "trash"), false);
});

test("a plain unhandled Escape leaves focus mode", () => {
  assert.equal(escapeExitsFocusMode(escape(), false, false), true);
});

test("Escape stays with whatever already handled it", () => {
  assert.equal(escapeExitsFocusMode(escape({ defaultPrevented: true }), false, false), false);
  assert.equal(escapeExitsFocusMode(escape({ isComposing: true }), false, false), false);
  assert.equal(escapeExitsFocusMode(escape(), false, true), false);
});

test("Escape stays with Vim, where it returns to normal mode", () => {
  assert.equal(escapeExitsFocusMode(escape(), true, false), false);
});

test("modified Escape and other keys never leave focus mode", () => {
  assert.equal(escapeExitsFocusMode(escape({ shiftKey: true }), false, false), false);
  assert.equal(escapeExitsFocusMode(escape({ ctrlKey: true }), false, false), false);
  assert.equal(escapeExitsFocusMode(escape({ key: "Enter" }), false, false), false);
});

test("each change of focus mode is announced", () => {
  assert.equal(focusModeAnnouncement(true), "Focus mode on");
  assert.equal(focusModeAnnouncement(false), "Focus mode off");
});
