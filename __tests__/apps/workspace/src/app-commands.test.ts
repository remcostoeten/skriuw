import assert from "node:assert/strict";
import { test } from "vitest";
import { noop } from "@skriuw/shared/helpers/noop";
import { createCommandRegistry, type CommandUiState } from "@/commands/registry";
import { createAppCommands, type AppCommandControls } from "@/app-commands";
import { SHORTCUT_DEFINITIONS } from "@/commands/definitions";
import { THEME_ENTRIES } from "@/features/settings/themes";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { setupTauriInvokeStub } from "./shared/tauri-stub";

setupTauriInvokeStub();

const fakeStore = { getState: () => ({}) as RendererState } as RendererStore;

const controls: AppCommandControls = {
  togglePalette: noop,
  openSettings: noop,
  openSettingsAt: noop,
  openSignIn: noop,
  toggleSidebar: noop,
  toggleMetadata: noop,
  toggleFocusMode: noop,
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

const REGISTERED_COMMAND_IDS = [
  "ai-repeat-last",
  "annotate-note",
  "close-split",
  "close-tab",
  "cloud-sign-in",
  "collapse-all-folders",
  "cycle-pane-next",
  "cycle-pane-previous",
  "duplicate-current-note",
  "export-note-markdown",
  "export-workspace-markdown",
  "find-and-replace-in-note",
  "find-in-note",
  "focus-editor",
  "focus-main-content",
  "focus-metadata",
  "focus-pane-left",
  "focus-pane-right",
  "focus-sidebar",
  "go-to-journal",
  "go-to-notes",
  "go-to-people",
  "go-to-tab-0",
  "go-to-tab-1",
  "go-to-tab-2",
  "go-to-tab-3",
  "go-to-tab-4",
  "go-to-tab-5",
  "go-to-tab-6",
  "go-to-tab-7",
  "go-to-tab-8",
  "go-to-tab-9",
  "go-to-tags",
  "go-to-tasks",
  "go-to-trash",
  "import-markdown",
  "import-markdown-file",
  "import-provider-export",
  "journal-focus-search",
  "journal-go-to-date",
  "journal-next-day",
  "journal-next-month",
  "journal-next-week",
  "journal-next-year",
  "journal-previous-day",
  "journal-previous-month",
  "journal-previous-week",
  "journal-previous-year",
  "journal-today",
  "lock-notes-now",
  "move-tab-left",
  "move-tab-right",
  "new-folder",
  "new-note",
  "new-note-from-template",
  "new-person",
  "new-tag",
  "next-note",
  "next-tab",
  "open-below",
  "open-beside",
  "open-settings",
  "open-theme-settings",
  "previous-note",
  "previous-tab",
  "quit-app",
  "rename-current-note",
  "reopen-closed-tab",
  "reset-split-size",
  "save-note-as-template",
  "share-note-link",
  "show-shortcut-help",
  "toggle-command-palette",
  "toggle-editor-mode",
  "toggle-focus-dim",
  "toggle-focus-mode",
  "toggle-lock-note",
  "toggle-maximize",
  "toggle-metadata",
  "toggle-pin-note",
  "toggle-sidebar",
  "toggle-split-orientation",
  "toggle-typewriter-scrolling",
  "toggle-vim-mode",
  "trash-current-note",
  "unlock-notes",
  "zoom-in",
  "zoom-out",
  "zoom-reset",
];

test("the composed modules register exactly the established command ids", () => {
  const ids = createAppCommands(fakeStore, controls, false).map((command) => command.id);
  assert.deepEqual(ids.filter((id) => !id.startsWith("set-theme-")).sort(), REGISTERED_COMMAND_IDS);
  const themeIds = THEME_ENTRIES.flatMap((entry) =>
    entry.variants ? entry.variants.map((variant) => variant.id) : [entry.id],
  );
  assert.deepEqual(
    ids.filter((id) => id.startsWith("set-theme-")).sort(),
    themeIds.map((id) => `set-theme-${id}`).sort(),
  );
});

test("every globally bound shortcut definition maps to exactly one workspace command", () => {
  const registry = createCommandRegistry(createAppCommands(fakeStore, controls, false));
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
  const registry = createCommandRegistry(createAppCommands(fakeStore, controls, false));
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
    createAppCommands(
      fakeStore,
      {
        ...controls,
        openSignIn: () => {
          opened += 1;
        },
      },
      false,
    ),
  );
  const state = {} as RendererState;
  assert.equal(registry.isVisible("cloud-sign-in", state, fakeUi()), true);
  assert.equal(registry.isVisible("cloud-sign-in", state, fakeUi({ route: "trash" })), true);
  registry.run("cloud-sign-in", state, fakeUi());
  assert.equal(opened, 1);
});

test("focus commands require their region to be reachable", () => {
  const registry = createCommandRegistry(createAppCommands(fakeStore, controls, false));
  const state = { activeNoteId: null } as RendererState;
  assert.equal(registry.isEnabled("focus-editor", state, fakeUi()), false);
  assert.equal(registry.isEnabled("focus-sidebar", state, fakeUi({ sidebarOpen: false })), false);
  assert.equal(registry.isEnabled("focus-metadata", state, fakeUi({ metadataOpen: false })), false);
});

test("route commands hide their current route and navigate to the other", () => {
  const targets: string[] = [];
  const registry = createCommandRegistry(
    createAppCommands(
      fakeStore,
      {
        ...controls,
        navigate: (route) => {
          targets.push(route);
        },
      },
      false,
    ),
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
  const { createInitialState, createRendererStore } =
    await import("@skriuw/renderer-core/store/store");
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

test("focus sidebar moves the tree cursor to its first visible row", async () => {
  const store = await pinFixture({
    activeNoteId: "open",
    nodes: [node("first", 1), node("open", 2)],
  });
  store.setFocusedNode("open");
  const registry = createCommandRegistry(createAppCommands(store, controls, false));

  withSidebarFocus(false, () => registry.run("focus-sidebar", store.getState(), fakeUi()));

  assert.equal(store.getState().focusedNodeId, "first");
});

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
  const registry = createCommandRegistry(createAppCommands(store, controls, false));

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
  const registry = createCommandRegistry(createAppCommands(store, controls, false));

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
  const registry = createCommandRegistry(createAppCommands(store, controls, false));

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
  const registry = createCommandRegistry(createAppCommands(store, controls, false));

  assert.equal(
    withSidebarFocus(true, () => registry.isEnabled("toggle-pin-note", store.getState(), fakeUi())),
    true,
  );
  assert.equal(
    withSidebarFocus(false, () =>
      registry.isEnabled("toggle-pin-note", store.getState(), fakeUi()),
    ),
    false,
  );
});

test("journal navigation commands run only on the journal route and move the viewed day", () => {
  const registry = createCommandRegistry(createAppCommands(fakeStore, controls, false));
  const state = {} as RendererState;
  const steps = [
    ["journal-previous-week", "#/journal/2026-09-08"],
    ["journal-next-week", "#/journal/2026-09-22"],
    ["journal-previous-month", "#/journal/2026-08-15"],
    ["journal-next-month", "#/journal/2026-10-15"],
    ["journal-previous-year", "#/journal/2025-09-15"],
    ["journal-next-year", "#/journal/2027-09-15"],
  ] as const;
  const previous = globalThis.window;
  try {
    for (const [id] of [...steps, ["journal-go-to-date", ""] as const]) {
      assert.equal(registry.isEnabled(id, state, fakeUi()), false, `${id} on notes`);
      assert.equal(registry.isEnabled(id, state, fakeUi({ route: "journal" })), true, id);
    }
    for (const [id, expected] of steps) {
      const location = { hash: "#/journal/2026-09-15" };
      globalThis.window = { location } as unknown as Window & typeof globalThis;
      registry.run(id, state, fakeUi({ route: "journal" }));
      assert.equal(location.hash, expected, id);
    }
    const target = new EventTarget();
    let requested = 0;
    target.addEventListener("skriuw:journal-go-to-date", () => {
      requested += 1;
    });
    globalThis.window = target as unknown as Window & typeof globalThis;
    registry.run("journal-go-to-date", state, fakeUi({ route: "journal" }));
    assert.equal(requested, 1);
  } finally {
    globalThis.window = previous;
  }
});
