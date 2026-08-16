import assert from "node:assert/strict";
import test from "node:test";
import * as settingsActions from "../../../src/store/actions/settings";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import { selectAiEnabled } from "../../../src/features/ai/opt-in-gate";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";

setupTauriInvokeStub();

test("settings action exports exist and are functions", () => {
  assert.equal(typeof settingsActions.updateSettings, "function");
  assert.equal(typeof settingsActions.updateSetting, "function");
  assert.equal(typeof settingsActions.setShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearAllShortcutOverrides, "function");
});

test("AI opt-in follows the settings operation and bootstrap round trip", () => {
  const snapshot = {
    protocolVersion: 1,
    activeNoteId: null,
    nodes: [],
    documents: [],
    historyHeaders: [],
    settings: DEFAULT_WORKSPACE_SETTINGS,
  } as const;
  const store = createRendererStore(createInitialState(snapshot));

  settingsActions.updateSetting(store, "aiEnabled", true);
  assert.equal(selectAiEnabled(store.getState()), true);

  const restored = createRendererStore(
    createInitialState({ ...snapshot, settings: store.getState().settings }),
  );
  assert.equal(selectAiEnabled(restored.getState()), true);
});
