import assert from "node:assert/strict";
import test from "node:test";
import { noop } from "../../src/shared/lib/noop";
import { createCommandRegistry, type CommandUiState } from "../../src/commands/registry";
import { createWorkspaceCommands } from "../../src/commands/workspace-commands";
import type { CommandUiControls } from "../../src/commands/workspace-commands";
import { SHORTCUT_DEFINITIONS } from "../../src/shortcuts/definitions";
import { shortcutScopesActive } from "../../src/shortcuts/bindings";
import { activeShortcutScopes } from "../../src/shortcuts/workspace-shortcuts";
import type { AppRoute } from "../../src/app-route";
import type { RendererState, RendererStore } from "../../src/store/types";

const ROUTES: readonly AppRoute[] = [
  "notes",
  "trash",
  "tags",
  "people",
  "history",
  "journal",
];

/**
 * State permissive enough that every non-route gate passes: a focused note, two
 * panes, a tab strip with something to move and something to reopen. What is
 * left filtering a command is its route gate alone.
 */
const permissiveState = {
  activeNoteId: "note-1",
  focusedPaneId: "pane-1",
  noteIds: ["note-1", "note-2"],
  nodes: new Map([
    ["note-1", { id: "note-1", kind: "note" }],
    ["note-2", { id: "note-2", kind: "note" }],
  ]),
  panes: [
    { paneId: "pane-1", openNoteIds: ["note-1", "note-2"], activeNoteId: "note-1" },
    { paneId: "pane-2", openNoteIds: ["note-1", "note-2"], activeNoteId: "note-2" },
  ],
  closedTabsByPaneId: new Map([["pane-1", [{ noteId: "note-3", index: 0 }]]]),
  settings: { openNotesInTabs: true },
} as unknown as RendererState;

const controls: CommandUiControls = {
  togglePalette: noop,
  openSettings: noop,
  toggleSidebar: noop,
  toggleMetadata: noop,
  navigate: noop,
};

function uiFor(route: AppRoute): CommandUiState {
  return { route, sidebarOpen: true, metadataOpen: true, settingsOpen: false };
}

/** Routes on which a definition's scope gate lets the key through. */
function routesScopesAllow(definition: (typeof SHORTCUT_DEFINITIONS)[number]): AppRoute[] {
  return ROUTES.filter((route) =>
    [
      activeShortcutScopes(route, true, true, true),
      activeShortcutScopes(route, false, false, false),
    ].some((scopes) => shortcutScopesActive(definition, new Set(scopes))),
  );
}

/**
 * The cheat sheet lists a binding with the conditions its scopes imply, so a
 * key that survives its scope gate on a route has to reach a command that is
 * actually enabled there. A notes-only command behind an unscoped definition
 * is exactly the mismatch this catches: the overlay would advertise the key
 * everywhere while the command silently refuses it off the notes route.
 */
test("a binding's scopes never let it through on a route its command refuses", () => {
  const registry = createCommandRegistry(createWorkspaceCommands(fakeStore(), controls));
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.boundInEditor) {
      continue;
    }
    const command = registry.commandForShortcut(definition.id);
    assert.ok(command, `no command bound to shortcut ${definition.id}`);
    const enabledOn = ROUTES.filter((route) =>
      registry.isEnabled(command.id, permissiveState, uiFor(route)),
    );
    for (const route of routesScopesAllow(definition)) {
      assert.ok(
        enabledOn.includes(route),
        `${definition.id} passes its scope gate on "${route}" but its command is only enabled on [${enabledOn.join(", ")}] — add the matching scope so the cheat sheet stops advertising it there`,
      );
    }
  }
});

function fakeStore(): RendererStore {
  return { getState: () => permissiveState } as RendererStore;
}
