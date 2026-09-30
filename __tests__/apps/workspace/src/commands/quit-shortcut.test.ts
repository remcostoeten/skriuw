import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import {
  changeQuitShortcutEnabled,
  findShortcutConflict,
  quitCombo,
  quitComboError,
  quitShortcutEnabled,
  shortcutBindsOnPlatform,
  shortcutDefinition,
  shortcutOverridesFromSettings,
  shortcutShadowedByQuit,
  storedShortcutOverrides,
} from "@/commands/bindings";
import { shortcutHelpCombos } from "@/commands/help-model";
import { shortcutHint } from "@/commands/hints";

function settingsWith(overrides: unknown): WorkspaceSettings {
  return {
    settingsVersion: 1,
    theme: "system",
    compactSidebar: false,
    showPageIcons: true,
    rememberLastNote: true,
    editorFont: "sans",
    editorLineHeight: "1.6",
    showLineNumbers: false,
    editorPlaceholder: "Start writing",
    shortcutOverrides: overrides,
  };
}

test("quit accepts two and three key chords that hold ctrl or cmd", () => {
  assert.equal(quitComboError("ctrl+q"), null);
  assert.equal(quitComboError("ctrl+shift+w"), null);
  assert.equal(quitComboError("meta+alt+q"), null);
  assert.equal(quitComboError("mod+shift+q"), null);
});

test("quit refuses plain keys, missing ctrl, four keys, sequences and editing chords", () => {
  assert.notEqual(quitComboError("q"), null);
  assert.notEqual(quitComboError("shift+q"), null);
  assert.notEqual(quitComboError("alt+q"), null);
  assert.notEqual(quitComboError("ctrl+alt+shift+q"), null);
  assert.notEqual(quitComboError("g then q"), null);
  assert.notEqual(quitComboError("ctrl+c"), null);
  assert.notEqual(quitComboError("ctrl+shift+z"), null);
});

test("an invalid stored quit combo falls back to the default", () => {
  assert.deepEqual(storedShortcutOverrides(settingsWith({ quitApp: "q" })), {});
  assert.deepEqual(storedShortcutOverrides(settingsWith({ quitApp: "ctrl+q" })), {
    quitApp: "ctrl+q",
  });
});

test("switching quit off unbinds it but keeps the recorded combo", () => {
  const settings = changeQuitShortcutEnabled(settingsWith({ quitApp: "ctrl+q" }), false);
  assert.equal(quitShortcutEnabled(settings), false);
  assert.equal(storedShortcutOverrides(settings).quitApp, "ctrl+q");
  const overrides = shortcutOverridesFromSettings(settings);
  assert.equal(overrides.quitApp, null);
  assert.equal(quitCombo(overrides), null);
  assert.equal(shortcutBindsOnPlatform(shortcutDefinition("quitApp"), overrides, "linux"), false);
  assert.equal(shortcutHint("quitApp", overrides, "linux"), undefined);

  const enabled = shortcutOverridesFromSettings(changeQuitShortcutEnabled(settings, true));
  assert.equal(quitCombo(enabled), "ctrl+q");
});

test("quit shadows another action on the same combo", () => {
  const overrides = shortcutOverridesFromSettings(settingsWith({ quitApp: "mod+w" }));
  const closeTab = shortcutDefinition("closeTab");
  assert.equal(shortcutShadowedByQuit(closeTab, "mod+w", overrides), true);
  assert.equal(shortcutHint("closeTab", overrides, "linux"), undefined);
  assert.deepEqual(shortcutHelpCombos(closeTab, overrides, "linux"), []);
  assert.equal(shortcutShadowedByQuit(shortcutDefinition("quitApp"), "mod+w", overrides), false);
});

test("no action can take the live quit combo, but a switched-off one is free", () => {
  const live = shortcutOverridesFromSettings(settingsWith({}));
  assert.equal(findShortcutConflict(live, "createNote", "mod+shift+q")?.actionId, "quitApp");

  const off = shortcutOverridesFromSettings(changeQuitShortcutEnabled(settingsWith({}), false));
  assert.equal(findShortcutConflict(off, "createNote", "mod+shift+q"), null);
});
