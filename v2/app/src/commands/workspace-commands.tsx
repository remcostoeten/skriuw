import { createFolder, createNote } from "../actions/workspace";
import type { AppRoute } from "../app-route";
import { openEditorSearch } from "../editor/search-controller";
import {
  FolderOpenIcon,
  NewFolderIcon,
  NewNoteIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "../shared/icons";
import type { RendererStore } from "../store/types";
import { focusRegion } from "./focus-regions";
import type { AppCommand, CommandPredicate } from "./registry";

export type CommandUiControls = {
  togglePalette: () => void;
  openSettings: () => void;
  toggleSidebar: () => void;
  toggleMetadata: () => void;
  navigate: (route: AppRoute) => void;
};

const onNotesRoute: CommandPredicate = (_state, ui) => ui.route === "notes";

export function createWorkspaceCommands(
  store: RendererStore,
  controls: CommandUiControls,
): AppCommand[] {
  return [
    {
      id: "toggle-command-palette",
      label: "Open command palette",
      group: "General",
      shortcut: "toggleCommandPalette",
      visible: () => false,
      run: controls.togglePalette,
    },
    {
      id: "new-note",
      label: "New note",
      group: "Actions",
      keywords: ["create"],
      icon: <NewNoteIcon size={15} />,
      shortcut: "createNote",
      enabled: onNotesRoute,
      run: () => createNote(store, null),
    },
    {
      id: "new-folder",
      label: "New folder",
      group: "Actions",
      keywords: ["create"],
      icon: <NewFolderIcon size={15} />,
      shortcut: "createFolder",
      enabled: onNotesRoute,
      run: () => createFolder(store, null),
    },
    {
      id: "open-settings",
      label: "Open settings",
      group: "General",
      keywords: ["preferences"],
      icon: <SettingsIcon size={15} />,
      shortcut: "openSettings",
      run: controls.openSettings,
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "Navigation",
      icon: <PanelLeftToggleIcon size={15} />,
      shortcut: "toggleSidebar",
      enabled: onNotesRoute,
      run: controls.toggleSidebar,
    },
    {
      id: "toggle-metadata",
      label: "Toggle metadata panel",
      group: "Navigation",
      icon: <PanelRightToggleIcon size={15} />,
      shortcut: "toggleMetadata",
      enabled: onNotesRoute,
      run: controls.toggleMetadata,
    },
    {
      id: "focus-sidebar",
      label: "Focus sidebar",
      group: "Navigation",
      shortcut: "focusSidebar",
      enabled: (state, ui) => onNotesRoute(state, ui) && ui.sidebarOpen,
      run: () => {
        focusRegion("sidebar");
      },
    },
    {
      id: "focus-editor",
      label: "Focus editor",
      group: "Navigation",
      shortcut: "focusEditor",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: () => {
        focusRegion("editor");
      },
    },
    {
      id: "focus-metadata",
      label: "Focus metadata panel",
      group: "Navigation",
      shortcut: "focusMetadata",
      enabled: (state, ui) => onNotesRoute(state, ui) && ui.metadataOpen,
      run: () => {
        focusRegion("metadata");
      },
    },
    {
      id: "find-in-note",
      label: "Find in note",
      group: "Editor",
      keywords: ["search", "replace", "find"],
      icon: <SearchIcon size={15} />,
      shortcut: "findInNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: openEditorSearch,
    },
    {
      id: "go-to-notes",
      label: "Go to notes",
      group: "Navigation",
      icon: <FolderOpenIcon size={15} />,
      shortcut: "goToNotes",
      visible: (_state, ui) => ui.route !== "notes",
      run: () => controls.navigate("notes"),
    },
    {
      id: "go-to-trash",
      label: "Go to trash",
      group: "Navigation",
      icon: <Trash2Icon size={15} />,
      shortcut: "goToTrash",
      visible: (_state, ui) => ui.route !== "trash",
      run: () => controls.navigate("trash"),
    },
  ];
}
