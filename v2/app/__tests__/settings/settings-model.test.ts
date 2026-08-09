import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceSettings } from "../../src/contracts/workspace";
import {
  DEFAULT_WORKSPACE_SETTINGS,
  changeSetting,
  changeShortcutOverride,
  projectSettings,
  resetShortcutOverride,
  resetShortcutOverrides,
  showsToasts,
} from "../../src/settings/settings-model";

function extendedSettings(): WorkspaceSettings {
  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    futureSetting: { nested: ["kept", 3] },
    shortcutOverrides: {
      createNote: "mod+alt+n",
      futureAction: "mod+shift+u",
      futureShape: { enabled: true },
    },
  };
}

test("default settings project every editable field", () => {
  assert.deepEqual(projectSettings(DEFAULT_WORKSPACE_SETTINGS), {
    theme: "midnight",
    compactSidebar: false,
    showTreeGuides: false,
    reduceMotion: false,
    rememberLastNote: true,
    editorFont: "inter",
    editorLineHeight: "comfortable",
    editorPlaceholder: "Start writing...",
    editorDefaultRawMode: false,
    openNotesInTabs: false,
    showToasts: true,
  });
});

test("toasts stay enabled unless the setting is explicitly false", () => {
  assert.equal(showsToasts(DEFAULT_WORKSPACE_SETTINGS), true);
  assert.equal(showsToasts({ ...DEFAULT_WORKSPACE_SETTINGS, showToasts: false }), false);
  const { showToasts: _absent, ...withoutField } = DEFAULT_WORKSPACE_SETTINGS;
  assert.equal(showsToasts(withoutField as WorkspaceSettings), true);
});

test("unsupported identifiers project to defaults without changing the document", () => {
  const settings = {
    ...extendedSettings(),
    theme: "future-theme",
    editorFont: "future-font",
    editorLineHeight: "future-spacing",
  };
  const projected = projectSettings(settings);
  assert.equal(projected.theme, "midnight");
  assert.equal(projected.editorFont, "inter");
  assert.equal(projected.editorLineHeight, "comfortable");
  assert.equal(settings.theme, "future-theme");
});

test("changed-field documents preserve version and unknown fields", () => {
  const settings = extendedSettings();
  const changed = changeSetting(settings, "compactSidebar", true);
  assert.equal(changed.compactSidebar, true);
  assert.equal(changed.settingsVersion, 1);
  assert.deepEqual(changed.futureSetting, settings.futureSetting);
  assert.deepEqual(changed.shortcutOverrides, settings.shortcutOverrides);
});

test("shortcut changes preserve unknown top-level and nested extension data", () => {
  const settings = extendedSettings();
  const changed = changeShortcutOverride(settings, "createFolder", "mod+alt+f");
  assert.deepEqual(changed.futureSetting, settings.futureSetting);
  assert.deepEqual(changed.shortcutOverrides, {
    createNote: "mod+alt+n",
    createFolder: "mod+alt+f",
    futureAction: "mod+shift+u",
    futureShape: { enabled: true },
  });
});

test("override reset removes only the selected action", () => {
  const settings = extendedSettings();
  const reset = resetShortcutOverride(settings, "createNote");
  assert.deepEqual(reset.shortcutOverrides, {
    futureAction: "mod+shift+u",
    futureShape: { enabled: true },
  });
  assert.deepEqual(reset.futureSetting, settings.futureSetting);
  assert.equal(resetShortcutOverride(reset, "createNote"), reset);
});

test("reset-all removes every listed override but keeps extension data", () => {
  const settings = {
    ...extendedSettings(),
    shortcutOverrides: {
      createNote: "mod+alt+n",
      createFolder: "mod+alt+f",
      futureAction: "mod+shift+u",
      futureShape: { enabled: true },
    },
  };
  const reset = resetShortcutOverrides(settings, ["createNote", "createFolder"]);
  assert.deepEqual(reset.shortcutOverrides, {
    futureAction: "mod+shift+u",
    futureShape: { enabled: true },
  });
  assert.deepEqual(reset.futureSetting, settings.futureSetting);
});

test("reset-all without matching overrides returns the same document", () => {
  const settings = extendedSettings();
  assert.equal(resetShortcutOverrides(settings, ["createFolder"]), settings);
  assert.equal(resetShortcutOverrides(DEFAULT_WORKSPACE_SETTINGS, ["createNote"]), DEFAULT_WORKSPACE_SETTINGS);
});
