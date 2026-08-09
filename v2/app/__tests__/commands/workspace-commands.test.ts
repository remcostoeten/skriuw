import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../src/shared/lib/noop";
import { createCommandRegistry, type CommandUiState } from "../../src/commands/registry";
import { createWorkspaceCommands } from "../../src/commands/workspace-commands";
import type { CommandUiControls } from "../../src/commands/workspace-commands";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import type { RendererState, RendererStore } from "../../src/store/types";
import { setupTauriInvokeStub } from "../shared/tauri-stub";

setupTauriInvokeStub();

const fakeStore = { getState: () => ({}) as RendererState } as RendererStore;

const controls: CommandUiControls = {
  togglePalette: noop,
  openSettings: noop,
  openSignIn: noop,
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

test("every globally bound shortcut definition maps to exactly one workspace command", () => {
  const registry = createCommandRegistry(createWorkspaceCommands(fakeStore, controls));
  for (const definition of SHORTCUT_DEFINITIONS) {
    const command = registry.commandForShortcut(definition.id);
    if (definition.boundInEditor) {
      assert.equal(command, undefined, `editor-bound shortcut ${definition.id} has a command`);
      continue;
    }
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

test("cloud sign-in command is available everywhere and opens the shell drawer", () => {
  let opened = 0;
  const registry = createCommandRegistry(
    createWorkspaceCommands(fakeStore, {
      ...controls,
      openSignIn: () => {
        opened += 1;
      },
    }),
  );
  const state = {} as RendererState;
  assert.equal(registry.isVisible("cloud-sign-in", state, fakeUi()), true);
  assert.equal(registry.isVisible("cloud-sign-in", state, fakeUi({ route: "trash" })), true);
  registry.run("cloud-sign-in", state, fakeUi());
  assert.equal(opened, 1);
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

const NOTE_SETTINGS = {
  settingsVersion: 1,
  theme: "system",
  compactSidebar: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "sans",
  editorLineHeight: "1.6",
  showLineNumbers: false,
  editorPlaceholder: "",
};

function node(id: string, rank: number, kind: "note" | "folder" = "note") {
  return {
    id,
    kind,
    parentId: null,
    rank,
    title: id,
    icon: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pinnedAt: null,
  };
}

async function pinFixture(snapshot: Record<string, unknown>) {
  const { createInitialState, createRendererStore } = await import("../../src/store/store");
  return createRendererStore(
    createInitialState({
      protocolVersion: 1,
      documents: [],
      historyHeaders: [],
      settings: NOTE_SETTINGS,
      ...snapshot,
    } as never),
  );
}

type DocumentGlobal = { document?: unknown };

function withSidebarFocus<T>(inSidebar: boolean, body: () => T): T {
  const globals = globalThis as DocumentGlobal;
  const previous = globals.document;
  globals.document = {
    activeElement: { closest: (selector: string) => (inSidebar ? { selector } : null) },
    querySelector: () => null,
  };
  try {
    return body();
  } finally {
    globals.document = previous;
  }
}

function pinnedAt(store: RendererStore, id: string): number | null {
  return store.getState().sourceNodes.get(id)?.pinnedAt ?? null;
}

test("pin targets the sidebar's focused row while the tree has focus", async () => {
  const store = await pinFixture({
    activeNoteId: "open",
    nodes: [node("open", 1), node("row", 2)],
  });
  store.setFocusedNode("row");
  const registry = createCommandRegistry(createWorkspaceCommands(store, controls));

  withSidebarFocus(true, () => registry.run("toggle-pin-note", store.getState(), fakeUi()));
  assert.notEqual(pinnedAt(store, "row"), null);
  assert.equal(pinnedAt(store, "open"), null);
});

test("pin falls back to the open note when focus is outside the sidebar", async () => {
  const store = await pinFixture({
    activeNoteId: "open",
    nodes: [node("open", 1), node("row", 2)],
  });
  store.setFocusedNode("row");
  const registry = createCommandRegistry(createWorkspaceCommands(store, controls));

  withSidebarFocus(false, () => registry.run("toggle-pin-note", store.getState(), fakeUi()));
  assert.notEqual(pinnedAt(store, "open"), null);
  assert.equal(pinnedAt(store, "row"), null);
});

test("pin ignores a focused folder row and keeps the open note as target", async () => {
  const store = await pinFixture({
    activeNoteId: "open",
    nodes: [node("open", 1), node("folder", 2, "folder")],
  });
  store.setFocusedNode("folder");
  const registry = createCommandRegistry(createWorkspaceCommands(store, controls));

  withSidebarFocus(true, () => registry.run("toggle-pin-note", store.getState(), fakeUi()));
  assert.notEqual(pinnedAt(store, "open"), null);
  assert.equal(pinnedAt(store, "folder"), null);
});

test("pin stays enabled from the sidebar with no note open", async () => {
  const store = await pinFixture({ activeNoteId: null, nodes: [node("row", 1)] });
  store.update((current) => ({
    ...current,
    activeNoteId: null,
    panes: current.panes.map((pane) => ({ ...pane, activeNoteId: null })),
  }));
  store.setFocusedNode("row");
  const registry = createCommandRegistry(createWorkspaceCommands(store, controls));

  assert.equal(
    withSidebarFocus(true, () =>
      registry.isEnabled("toggle-pin-note", store.getState(), fakeUi()),
    ),
    true,
  );
  assert.equal(
    withSidebarFocus(false, () =>
      registry.isEnabled("toggle-pin-note", store.getState(), fakeUi()),
    ),
    false,
  );
});
