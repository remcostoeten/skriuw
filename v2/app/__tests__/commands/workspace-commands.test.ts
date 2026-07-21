import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../src/shared/lib/noop";
import { createCommandRegistry, type CommandUiState } from "../../src/commands/registry";
import { createWorkspaceCommands } from "../../src/commands/workspace-commands";
import type { CommandUiControls } from "../../src/commands/workspace-commands";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import type { RendererState, RendererStore } from "../../src/store/types";

const fakeStore = { getState: () => ({}) as RendererState } as RendererStore;

const controls: CommandUiControls = {
  togglePalette: noop,
  openSettings: noop,
  toggleSidebar: noop,
  toggleMetadata: noop,
  navigate: noop,
};

function fakeUi(overrides: Partial<CommandUiState> = {}): CommandUiState {
  return {
    route: "notes",
    sidebarOpen: true,
    metadataOpen: true,
    settingsOpen: false,
    ...overrides,
  };
}

test("every shortcut definition maps to exactly one workspace command", () => {
  const registry = createCommandRegistry(createWorkspaceCommands(fakeStore, controls));
  for (const definition of SHORTCUT_DEFINITIONS) {
    const command = registry.commandForShortcut(definition.id);
    assert.ok(command, `no command bound to shortcut ${definition.id}`);
  }
});

test("workspace-scoped commands disable off the notes route", () => {
  const registry = createCommandRegistry(createWorkspaceCommands(fakeStore, controls));
  const state = { activeNoteId: "note" } as RendererState;
  const trashUi = fakeUi({ route: "trash" });
  for (const id of [
    "new-note",
    "new-folder",
    "toggle-sidebar",
    "toggle-metadata",
    "focus-sidebar",
    "focus-editor",
    "focus-metadata",
  ]) {
    assert.equal(registry.isEnabled(id, state, fakeUi()), true, `${id} on notes`);
    assert.equal(registry.isEnabled(id, state, trashUi), false, `${id} on trash`);
  }
  assert.equal(registry.isEnabled("open-settings", state, trashUi), true);
  assert.equal(registry.isEnabled("toggle-command-palette", state, trashUi), true);
});

test("focus commands require their region to be reachable", () => {
  const registry = createCommandRegistry(createWorkspaceCommands(fakeStore, controls));
  const state = { activeNoteId: null } as RendererState;
  assert.equal(registry.isEnabled("focus-editor", state, fakeUi()), false);
  assert.equal(registry.isEnabled("focus-sidebar", state, fakeUi({ sidebarOpen: false })), false);
  assert.equal(
    registry.isEnabled("focus-metadata", state, fakeUi({ metadataOpen: false })),
    false,
  );
});

test("route commands hide their current route and navigate to the other", () => {
  const targets: string[] = [];
  const registry = createCommandRegistry(
    createWorkspaceCommands(fakeStore, {
      ...controls,
      navigate: (route) => {
        targets.push(route);
      },
    }),
  );
  const state = {} as RendererState;
  assert.equal(registry.isVisible("go-to-notes", state, fakeUi()), false);
  assert.equal(registry.isVisible("go-to-trash", state, fakeUi()), true);
  assert.equal(registry.isVisible("go-to-notes", state, fakeUi({ route: "trash" })), true);
  assert.equal(registry.isVisible("go-to-trash", state, fakeUi({ route: "trash" })), false);
  registry.run("go-to-trash", state, fakeUi());
  registry.run("go-to-notes", state, fakeUi({ route: "trash" }));
  assert.deepEqual(targets, ["trash", "notes"]);
});
