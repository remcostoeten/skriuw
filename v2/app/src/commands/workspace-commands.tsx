import { quitApp, toggleMaximize } from "../actions/window";
import {
  activateTabAtIndex,
  closeActiveTab,
  closeSplit,
  cycleTab,
  moveActiveTab,
  openBeside,
  reopenClosedTab,
  tabStripPaneId,
} from "../actions/panes";
import { toggleEditorMode } from "../actions/editor-mode";
import {
  createFolder,
  createNote,
  duplicateCurrentNote,
  focusedPaneNoteId,
  navigateNote,
  noteNavigationOrder,
  renameCurrentNote,
  restoreTrashedNote,
  setNodePinned,
  trashCurrentNote,
} from "../actions/workspace";
import type { AppRoute } from "../app-route";
import {
  openEditorSearch,
  openEditorSearchAndReplace,
} from "../editor/search-controller";
import {
  exportNoteAsMarkdown,
  exportWorkspaceAsMarkdown,
  importMarkdownIntoWorkspace,
  importProviderExportIntoWorkspace,
} from "../export/markdown-transfer";
import { requestEntityCreate } from "../references/entity-create-controller";
import { captureRenameReturnFocus } from "../shell/rename-focus";
import { showToast } from "../shared/ui/toast";
import { shortcutDefinition } from "../shortcuts/bindings";
import { TAB_INDEX_ACTION_IDS } from "../shortcuts/definitions";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  MaximizeIcon,
  NewFolderIcon,
  NewNoteIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  PencilIcon,
  PinIcon,
  ReplaceIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
  WaypointsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../shared/icons";
import { opensNotesInTabs } from "../settings/settings-model";
import type { RendererState, RendererStore } from "../store/types";
import { resetZoom, zoomIn, zoomOut } from "../zoom/zoom-controller";
import { focusRegion } from "./focus-regions";
import type { AppCommand, CommandPredicate } from "./registry";

export type CommandUiControls = {
  togglePalette: () => void;
  openSettings: () => void;
  toggleSidebar: () => void;
  /** Reveals the sidebar without toggling it, for actions that live in the tree. */
  openSidebar: () => void;
  toggleMetadata: () => void;
  navigate: (route: AppRoute) => void;
};

const onNotesRoute: CommandPredicate = (_state, ui) => ui.route === "notes";

function hasClosedTabs(state: RendererState): boolean {
  return (
    opensNotesInTabs(state.settings) &&
    (state.closedTabsByPaneId.get(tabStripPaneId(state))?.length ?? 0) > 0
  );
}

function hasMovableTabs(state: RendererState): boolean {
  const paneId = tabStripPaneId(state);
  const pane = state.panes.find((entry) => entry.paneId === paneId);
  return opensNotesInTabs(state.settings) && (pane?.openNoteIds.length ?? 0) > 1;
}

/**
 * Direct tab access, one command per digit key. Hidden from the palette — ten
 * "Go to tab N" rows would drown the list, and the cheat sheet renders the
 * bindings from `SHORTCUT_DEFINITIONS` instead.
 */
function tabIndexCommands(store: RendererStore): AppCommand[] {
  const indexed = TAB_INDEX_ACTION_IDS.map((shortcut, index) => ({
    shortcut,
    position: index + 1,
  }));
  return [...indexed, { shortcut: "openLastTab" as const, position: 0 }].map(
    ({ shortcut, position }) => ({
      id: `go-to-tab-${position}`,
      label: shortcutDefinition(shortcut).label,
      group: "Tabs",
      keywords: ["tab", "index", "position"],
      shortcut,
      visible: () => false,
      enabled: onNotesRoute,
      run: () => activateTabAtIndex(store, position),
    }),
  );
}

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
      id: "toggle-pin-note",
      label: "Pin or unpin current note",
      group: "Actions",
      keywords: ["pin", "unpin", "favorite", "shelf"],
      icon: <PinIcon size={15} />,
      shortcut: "togglePinNote",
      enabled: (state) => state.activeNoteId !== null,
      run: () => {
        const state = store.getState();
        const noteId = state.activeNoteId;
        if (!noteId) {
          return;
        }
        const pinned = (state.sourceNodes.get(noteId)?.pinnedAt ?? null) !== null;
        setNodePinned(store, noteId, !pinned);
      },
    },
    {
      id: "rename-current-note",
      label: "Rename current note",
      group: "Actions",
      keywords: ["rename", "title", "name"],
      icon: <PencilIcon size={15} />,
      shortcut: "renameCurrentNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && focusedPaneNoteId(state) !== null,
      run: () => {
        controls.openSidebar();
        captureRenameReturnFocus();
        renameCurrentNote(store);
      },
    },
    {
      id: "duplicate-current-note",
      label: "Duplicate current note",
      group: "Actions",
      keywords: ["duplicate", "copy", "clone"],
      icon: <CopyIcon size={15} />,
      shortcut: "duplicateCurrentNote",
      hint: shortcutDefinition("duplicateCurrentNote").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && focusedPaneNoteId(state) !== null,
      run: () => {
        captureRenameReturnFocus();
        void duplicateCurrentNote(store).then((duplicated) => {
          if (duplicated === null) {
            return;
          }
          controls.openSidebar();
          renameCurrentNote(store);
        });
      },
    },
    {
      id: "trash-current-note",
      label: "Move current note to trash",
      group: "Actions",
      keywords: ["trash", "delete", "remove"],
      icon: <Trash2Icon size={15} />,
      shortcut: "trashCurrentNote",
      hint: shortcutDefinition("trashCurrentNote").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && focusedPaneNoteId(state) !== null,
      run: () => {
        void trashCurrentNote(store).then((trashed) => {
          if (trashed === null) {
            return;
          }
          showToast({
            message: `Moved “${trashed.title}” to trash`,
            action: {
              label: "Undo",
              run: () => restoreTrashedNote(store, trashed.noteId),
            },
          });
        });
      },
    },
    {
      id: "toggle-editor-mode",
      label: "Toggle raw Markdown mode",
      group: "Actions",
      keywords: ["raw", "markdown", "source", "editor"],
      icon: <FileTextIcon size={15} />,
      shortcut: "toggleEditorMode",
      enabled: (state) => state.activeNoteId !== null,
      run: () => {
        const noteId = store.getState().activeNoteId;
        if (!noteId) {
          return;
        }
        toggleEditorMode(store, noteId);
      },
    },
    {
      id: "close-tab",
      label: "Close tab",
      group: "Tabs",
      keywords: ["tab", "close"],
      shortcut: "closeTab",
      enabled: onNotesRoute,
      run: () => closeActiveTab(store),
    },
    {
      id: "next-tab",
      label: "Next tab",
      group: "Tabs",
      keywords: ["tab", "cycle"],
      shortcut: "nextTab",
      enabled: (state, ui) =>
        onNotesRoute(state, ui) && (state.panes[0]?.openNoteIds.length ?? 0) > 1,
      run: () => cycleTab(store, 1),
    },
    {
      id: "previous-tab",
      label: "Previous tab",
      group: "Tabs",
      keywords: ["tab", "cycle"],
      shortcut: "previousTab",
      enabled: (state, ui) =>
        onNotesRoute(state, ui) && (state.panes[0]?.openNoteIds.length ?? 0) > 1,
      run: () => cycleTab(store, -1),
    },
    {
      id: "reopen-closed-tab",
      label: "Reopen closed tab",
      group: "Tabs",
      keywords: ["tab", "reopen", "restore", "undo"],
      shortcut: "reopenClosedTab",
      hint: shortcutDefinition("reopenClosedTab").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && hasClosedTabs(state),
      run: () => reopenClosedTab(store),
    },
    {
      id: "move-tab-left",
      label: "Move tab left",
      group: "Tabs",
      keywords: ["tab", "move", "reorder"],
      shortcut: "moveTabLeft",
      enabled: (state, ui) => onNotesRoute(state, ui) && hasMovableTabs(state),
      run: () => moveActiveTab(store, -1),
    },
    {
      id: "move-tab-right",
      label: "Move tab right",
      group: "Tabs",
      keywords: ["tab", "move", "reorder"],
      shortcut: "moveTabRight",
      enabled: (state, ui) => onNotesRoute(state, ui) && hasMovableTabs(state),
      run: () => moveActiveTab(store, 1),
    },
    ...tabIndexCommands(store),
    {
      id: "open-beside",
      label: "Open current note beside",
      group: "Tabs",
      keywords: ["split", "side by side", "pane"],
      shortcut: "openBeside",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: () => openBeside(store),
    },
    {
      id: "close-split",
      label: "Close split view",
      group: "Tabs",
      keywords: ["split", "pane"],
      shortcut: "closeSplit",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => closeSplit(store),
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
      label: "Import notes from folder…",
      group: "Actions",
      keywords: [
        "import",
        "markdown",
        "migrate",
        "folder",
        "obsidian",
        "notion",
        "bear",
        "simplenote",
        "apple notes",
      ],
      icon: <UploadIcon size={15} />,
      run: () => {
        void importMarkdownIntoWorkspace(store);
      },
    },
    {
      id: "import-provider-export",
      label: "Import provider export or files…",
      group: "Actions",
      keywords: [
        "import",
        "archive",
        "zip",
        "bear2bk",
        "notion",
        "simplenote",
        "csv",
        "json",
      ],
      icon: <UploadIcon size={15} />,
      run: () => {
        void importProviderExportIntoWorkspace(store);
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
      id: "find-and-replace-in-note",
      label: "Find and replace in note",
      group: "Editor",
      keywords: ["search", "replace", "substitute", "find"],
      icon: <ReplaceIcon size={15} />,
      shortcut: "findAndReplaceInNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: openEditorSearchAndReplace,
    },
    {
      id: "previous-note",
      label: "Previous note",
      group: "Navigation",
      keywords: ["note", "back", "cycle"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "previousNote",
      enabled: (state, ui) =>
        onNotesRoute(state, ui) &&
        state.activeNoteId !== null &&
        noteNavigationOrder(state).length > 1,
      run: () => navigateNote(store, -1),
    },
    {
      id: "next-note",
      label: "Next note",
      group: "Navigation",
      keywords: ["note", "forward", "cycle"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "nextNote",
      enabled: (state, ui) =>
        onNotesRoute(state, ui) &&
        state.activeNoteId !== null &&
        noteNavigationOrder(state).length > 1,
      run: () => navigateNote(store, 1),
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
      id: "toggle-maximize",
      label: "Toggle maximize",
      group: "View",
      keywords: ["window", "maximize", "full screen"],
      icon: <MaximizeIcon size={15} />,
      shortcut: "toggleMaximize",
      run: toggleMaximize,
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
