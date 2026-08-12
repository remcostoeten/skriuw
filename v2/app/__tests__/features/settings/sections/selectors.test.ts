import assert from "node:assert/strict";
import test from "node:test";
import { selectShortcutOverrides, sameOverrides, selectSettings } from "../../../../src/features/settings/sections/selectors";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../../src/features/settings/settings-model";
import type { RendererState } from "../../../../src/store/types";

const mockState = {
  settings: {
    ...DEFAULT_WORKSPACE_SETTINGS,
    shortcutOverrides: { createNote: "mod+alt+n" },
  },
} as unknown as RendererState;

test("selectSettings selects settings object from state", () => {
  assert.equal(selectSettings(mockState), mockState.settings);
});

test("selectShortcutOverrides returns shortcut overrides mapping", () => {
  const overrides = selectShortcutOverrides(mockState);
  assert.equal(overrides.createNote, "mod+alt+n");
});

test("sameOverrides correctly compares shortcut overrides maps", () => {
  const mapA = { createNote: "mod+alt+n" };
  const mapB = { createNote: "mod+alt+n" };
  const mapC = { createNote: "mod+shift+n" };
  const mapD = { createNote: "mod+alt+n", createFolder: "mod+alt+f" };

  assert.equal(sameOverrides(mapA, mapB), true);
  assert.equal(sameOverrides(mapA, mapC), false);
  assert.equal(sameOverrides(mapA, mapD), false);
});
