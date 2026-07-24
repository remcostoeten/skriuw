import { quitApp, toggleFullscreen } from "../actions/window";
import { createFolder, createNote } from "../actions/workspace";
import type { AppRoute } from "../app-route";
import { openEditorSearch } from "../editor/search-controller";
import {
  exportNoteAsMarkdown,
  exportWorkspaceAsMarkdown,
  importMarkdownIntoWorkspace,
} from "../export/markdown-transfer";
import { requestEntityCreate } from "../references/entity-create-controller";
import {
  CircleIcon,
  CloseIcon,
  DownloadIcon,
  FolderOpenIcon,
  MaximizeIcon,
  NewFolderIcon,
  NewNoteIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  WaypointsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../shared/icons";
import type { RendererStore } from "../store/types";
import { resetZoom, zoomIn, zoomOut } from "../zoom/zoom-controller";
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
      id: "new-tag",
      label: "New tag",
      group: "Actions",
      keywords: ["create", "tag", "label"],
      icon: <WaypointsIcon size={15} />,
      shortcut: "createTag",
      run: () => {
        controls.navigate("tags");
        requestEntityCreate("tag");
      },
    },
    {
      id: "new-person",
      label: "New person",
      group: "Actions",
      keywords: ["create", "person", "people", "mention"],
      icon: <CircleIcon size={15} />,
      shortcut: "createPerson",
      run: () => {
        controls.navigate("people");
        requestEntityCreate("person");
      },
    },
    {
      id: "export-note-markdown",
      label: "Export note as Markdown…",
      group: "Actions",
      keywords: ["export", "markdown", "save", "file"],
      icon: <DownloadIcon size={15} />,
      enabled: (state) => state.activeNoteId !== null,
      run: () => {
        const noteId = store.getState().activeNoteId;
        if (noteId) {
          void exportNoteAsMarkdown(store, noteId);
        }
      },
    },
    {
      id: "export-workspace-markdown",
      label: "Export workspace as Markdown…",
      group: "Actions",
      keywords: ["export", "markdown", "backup", "all"],
      icon: <DownloadIcon size={15} />,
      enabled: (state) => state.nodes.size > 0,
      run: () => {
        void exportWorkspaceAsMarkdown(store);
      },
    },
    {
      id: "import-markdown",
      label: "Import Markdown…",
      group: "Actions",
      keywords: ["import", "markdown", "migrate", "folder"],
      icon: <UploadIcon size={15} />,
      run: () => {
        void importMarkdownIntoWorkspace(store);
      },
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
      label: "Focus current note in sidebar",
      group: "Navigation",
      shortcut: "focusSidebar",
      enabled: (state, ui) => onNotesRoute(state, ui) && ui.sidebarOpen,
      run: () => {
        const activeNoteId = store.getState().activeNoteId;
        if (activeNoteId) {
          store.setFocusedNode(activeNoteId);
        }
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
      id: "go-to-tags",
      label: "Go to tags",
      group: "Navigation",
      icon: <WaypointsIcon size={15} />,
      shortcut: "goToTags",
      visible: (_state, ui) => ui.route !== "tags",
      run: () => controls.navigate("tags"),
    },
    {
      id: "go-to-people",
      label: "Go to people",
      group: "Navigation",
      icon: <CircleIcon size={15} />,
      shortcut: "goToPeople",
      visible: (_state, ui) => ui.route !== "people",
      run: () => controls.navigate("people"),
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
    {
      id: "toggle-fullscreen",
      label: "Toggle fullscreen",
      group: "View",
      keywords: ["window", "maximize", "full screen"],
      icon: <MaximizeIcon size={15} />,
      shortcut: "toggleFullscreen",
      run: toggleFullscreen,
    },
    {
      id: "quit-app",
      label: "Quit",
      group: "General",
      keywords: ["exit", "close app"],
      icon: <CloseIcon size={15} />,
      shortcut: "quitApp",
      run: quitApp,
    },
    {
      id: "zoom-in",
      label: "Zoom in",
      group: "View",
      keywords: ["bigger", "increase", "scale"],
      icon: <ZoomInIcon size={15} />,
      shortcut: "zoomIn",
      run: zoomIn,
    },
    {
      id: "zoom-out",
      label: "Zoom out",
      group: "View",
      keywords: ["smaller", "decrease", "scale"],
      icon: <ZoomOutIcon size={15} />,
      shortcut: "zoomOut",
      run: zoomOut,
    },
    {
      id: "zoom-reset",
      label: "Reset zoom",
      group: "View",
      keywords: ["100%", "default", "scale"],
      icon: <RotateCcwIcon size={15} />,
      shortcut: "zoomReset",
      run: resetZoom,
    },
  ];
}
