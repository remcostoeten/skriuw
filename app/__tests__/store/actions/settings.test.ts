import assert from "node:assert/strict";
import test from "node:test";
import * as settingsActions from "../../../src/store/actions/settings";
import { createInitialState, createRendererStore } from "../../../src/store/store";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import { selectAiEnabled } from "../../../src/features/ai/opt-in-gate";
import { setupTauriInvokeStub } from "../../shared/tauri-stub";
import type { WorkspaceOperation, WorkspaceSettings } from "../../../src/contracts/workspace";
import type { RendererStore } from "../../../src/store/types";

setupTauriInvokeStub();

function fakeStore(settings: WorkspaceSettings): {
  store: RendererStore;
  committed: WorkspaceOperation[];
} {
  const committed: WorkspaceOperation[] = [];
  const store = {
    getState: () => ({ settings }),
    applyOperations: (operations: WorkspaceOperation[]) => {
      committed.push(...operations);
    },
    applyAck: () => {},
  } as unknown as RendererStore;
  return { store, committed };
}

test("settings action exports exist and are functions", () => {
  assert.equal(typeof settingsActions.updateSettings, "function");
  assert.equal(typeof settingsActions.updateSetting, "function");
  assert.equal(typeof settingsActions.setShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearShortcutOverride, "function");
  assert.equal(typeof settingsActions.clearAllShortcutOverrides, "function");
});

test("choosing a default AI model commits a settings operation carrying the selection", () => {
  const { store, committed } = fakeStore(DEFAULT_WORKSPACE_SETTINGS);
  settingsActions.setAiModelSelection(store, {
    providerId: "ollama",
    modelId: "gemma3:4b",
  });
  assert.equal(committed.length, 1);
  const operation = committed[0];
  assert.equal(operation.type, "update_settings");
  assert.deepEqual(
    operation.type === "update_settings" ? operation.settings.aiModel : undefined,
    { providerId: "ollama", modelId: "gemma3:4b" },
  );
});

test("clearing a stored AI model drops the key, and clearing an absent one commits nothing", () => {
  const stored = fakeStore({
    ...DEFAULT_WORKSPACE_SETTINGS,
    aiModel: { providerId: "ollama", modelId: "gemma3:4b" },
  });
  settingsActions.setAiModelSelection(stored.store, null);
  assert.equal(stored.committed.length, 1);
  const operation = stored.committed[0];
  assert.equal(
    operation.type === "update_settings" && "aiModel" in operation.settings,
    false,
  );

  const absent = fakeStore(DEFAULT_WORKSPACE_SETTINGS);
  settingsActions.setAiModelSelection(absent.store, null);
  assert.equal(absent.committed.length, 0);
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
