import assert from "node:assert/strict";
import test from "node:test";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { shortcutHint } from "../../src/commands/hints";

test("shortcutHint formats the default binding for the platform", () => {
  assert.equal(shortcutHint("createNote", {}, "linux"), "Ctrl+N");
  assert.equal(shortcutHint("createFolder", {}, "linux"), "Shift+Ctrl+N");
});

test("shortcutHint follows a user rebind", () => {
  assert.equal(shortcutHint("createNote", { createNote: "mod+alt+j" }, "linux"), "Alt+Ctrl+J");
});

test("shortcutHint renders a sequence one step at a time", () => {
  const hint = shortcutHint("createNote", { createNote: "g then n" }, "linux");
  assert.equal(hint, `${formatShortcut("g", "linux")} ${formatShortcut("n", "linux")}`);
});

test("shortcutHint returns nothing when the default does not bind on the platform", () => {
  assert.equal(shortcutHint("goToDocumentStart", {}, "mac"), undefined);
  assert.ok(shortcutHint("goToDocumentStart", {}, "linux"));
});

test("shortcutHint shows an override even on a platform the default skips", () => {
  assert.equal(
    shortcutHint("goToDocumentStart", { goToDocumentStart: "mod+alt+up" }, "mac"),
    formatShortcut("mod+alt+up", "mac"),
  );
});
