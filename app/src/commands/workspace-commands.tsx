import { quitApp, toggleMaximize } from "@/store/actions/window";
import {
  activateTabAtIndex,
  closeActiveTab,
  closeSplit,
  cyclePaneFocus,
  cycleTab,
  focusPaneTowards,
  moveActiveTab,
  reopenClosedTab,
  resetSplitRatio,
  splitPane,
  tabStripPaneId,
  toggleSplitOrientation,
} from "@/store/actions/panes";
import { toggleEditorMode } from "@/store/actions/editor-mode";
import {
  activateNote,
  createFolder,
  createNote,
  duplicateCurrentNote,
  focusedFolderId,
  focusedPaneNoteId,
  focusedTreeNoteId,
  navigateNote,
  noteNavigationOrder,
  renameCurrentNote,
  restoreTrashedNote,
  setAllFoldersExpanded,
  setNodePinned,
  trashCurrentNote,
} from "@/store/actions/workspace";
import type { AppRoute } from "@/app-route";
import { authConfiguration } from "@/features/auth/config";
import {
  openEditorSearch,
  openEditorSearchAndReplace,
} from "@/features/editor/search-controller";
import {
  exportNoteAsMarkdown,
  exportWorkspaceAsMarkdown,
  importMarkdownFileIntoWorkspace,
  importMarkdownIntoWorkspace,
  importProviderExportIntoWorkspace,
} from "@/features/transfer/export/markdown-transfer";
import {
  openJournalDayOffset,
  openJournalToday,
  requestJournalSearchFocus,
} from "@/features/journal/navigation";
import { requestEntityCreate } from "@/features/references/entity-create-controller";
import { requestTemplatePicker } from "@/features/templates/template-picker-controller";
import { routeHasSidebar } from "@/shell/panel-layout";
import { captureRenameReturnFocus } from "@/features/sidebar/rename-focus";
import { showToast } from "@/shared/ui/toast";
import { shortcutDefinition } from "./bindings";
import { TAB_INDEX_ACTION_IDS } from "./definitions";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  CircleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  FoldVerticalIcon,
  FolderOpenIcon,
  KeyboardIcon,
  MaximizeIcon,
  NewFolderIcon,
  NewNoteIcon,
  PanelLeftIcon,
  PanelLeftToggleIcon,
  PanelRightIcon,
  PanelRightToggleIcon,
  PencilIcon,
  PinIcon,
  ReplaceIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  SplitViewCloseIcon,
  SplitViewIcon,
  SplitViewStackedIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
  UserIcon,
  WaypointsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/shared/icons/static";
import { opensNotesInTabs } from "@/features/settings/settings-model";
import type { RendererState, RendererStore } from "@/store/types";
import { resetZoom, zoomIn, zoomOut } from "@/shell/zoom-controller";
import {
  focusEditorPane,
  focusRegion,
  focusedPaneIndex,
  sidebarTreeHasFocus,
} from "./focus-regions";
import type { AppCommand, CommandPredicate } from "./registry";

export type CommandUiControls = {
  togglePalette: () => void;
  openSettings: () => void;
  /** Opens the shell-level cloud sign-in drawer, closing settings if it is open. */
  openSignIn: () => void;
  showShortcutHelp: () => void;
  toggleSidebar: () => void;
  /** Reveals the sidebar without toggling it, for actions that live in the tree. */
  openSidebar: () => void;
  toggleMetadata: () => void;
  navigate: (route: AppRoute) => void;
};

const onNotesRoute: CommandPredicate = (_state, ui) => ui.route === "notes";

const onSidebarRoute: CommandPredicate = (_state, ui) => routeHasSidebar(ui.route);

const onJournalRoute: CommandPredicate = (_state, ui) => ui.route === "journal";

function hasClosedTabs(state: RendererState): boolean {
  return (
    opensNotesInTabs(state.settings) &&
    (state.closedTabsByPaneId.get(tabStripPaneId(state))?.length ?? 0) > 0
  );
}

/**
 * Moves pane focus one step, reading the current pane from the DOM so a move
 * from the sidebar or metadata panel lands on the nearest pane that way.
 */
function focusPaneInDirection(store: RendererStore, direction: -1 | 1): void {
  const index = focusPaneTowards(store, direction, focusedPaneIndex());
  if (index !== null) {
    focusEditorPane(index);
  }
}

function cyclePaneInDirection(store: RendererStore, direction: -1 | 1): void {
  const index = cyclePaneFocus(store, direction, focusedPaneIndex());
  if (index !== null) {
    focusEditorPane(index);
  }
}

/**
 * The note a whole-note action targets, reading focus from the DOM: the
 * sidebar's focused row while the tree owns the keyboard, so acting from the
 * sidebar hits the row under the cursor rather than the note the editor shows.
 */
function targetNoteId(state: RendererState): string | null {
  if (sidebarTreeHasFocus()) {
    const treeNoteId = focusedTreeNoteId(state);
    if (treeNoteId !== null) {
      return treeNoteId;
    }
  }
  return focusedPaneNoteId(state);
}

function hasMovableTabs(state: RendererState): boolean {
  const paneId = tabStripPaneId(state);
  const pane = state.panes.find((entry) => entry.paneId === paneId);
  return opensNotesInTabs(state.settings) && (pane?.openNoteIds.length ?? 0) > 1;
}

/**
 * Runs the single-file import, targeting the sidebar's focused folder when
 * there is one. A single imported note switches to the notes view and opens,
 * matching the folder/archive import flows' hands-off default of just
 * reporting the result when more than one note lands.
 */
async function runImportMarkdownFile(
  store: RendererStore,
  controls: CommandUiControls,
): Promise<void> {
  const initialDestinationFolderId = focusedFolderId(store.getState());
  const createdNoteIds = await importMarkdownFileIntoWorkspace(
    store,
    initialDestinationFolderId,
  );
  const [noteId] = createdNoteIds ?? [];
  if (noteId !== undefined && createdNoteIds?.length === 1) {
    controls.navigate("notes");
    activateNote(store, noteId);
  }
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
      id: "new-note-from-template",
      label: "New note from template…",
      group: "Actions",
      keywords: ["create", "template", "daily", "meeting", "scaffold"],
      icon: <NewNoteIcon size={15} />,
      shortcut: "createNoteFromTemplate",
      enabled: onNotesRoute,
      run: () => requestTemplatePicker(null),
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
      enabled: (state) => targetNoteId(state) !== null,
      run: () => {
        const state = store.getState();
        const noteId = targetNoteId(state);
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
      enabled: (state, ui) => onNotesRoute(state, ui) && targetNoteId(state) !== null,
      run: () => {
        captureRenameReturnFocus();
        void duplicateCurrentNote(store, targetNoteId(store.getState())).then((duplicated) => {
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
      icon: <CloseIcon size={15} />,
      shortcut: "closeTab",
      enabled: onNotesRoute,
      run: () => closeActiveTab(store),
    },
    {
      id: "next-tab",
      label: "Next tab",
      group: "Tabs",
      keywords: ["tab", "cycle"],
      icon: <ChevronRightIcon size={15} />,
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
      icon: <ChevronLeftIcon size={15} />,
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
      icon: <Undo2Icon size={15} />,
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
      icon: <ArrowLeftIcon size={15} />,
      shortcut: "moveTabLeft",
      enabled: (state, ui) => onNotesRoute(state, ui) && hasMovableTabs(state),
      run: () => moveActiveTab(store, -1),
    },
    {
      id: "move-tab-right",
      label: "Move tab right",
      group: "Tabs",
      keywords: ["tab", "move", "reorder"],
      icon: <ArrowRightIcon size={15} />,
      shortcut: "moveTabRight",
      enabled: (state, ui) => onNotesRoute(state, ui) && hasMovableTabs(state),
      run: () => moveActiveTab(store, 1),
    },
    ...tabIndexCommands(store),
    {
      id: "open-beside",
      label: "Split vertically",
      group: "Tabs",
      keywords: ["split", "side by side", "pane", "beside", "vertical", "column"],
      icon: <SplitViewIcon size={15} />,
      shortcut: "openBeside",
      hint: shortcutDefinition("openBeside").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: () => splitPane(store, "vertical"),
    },
    {
      id: "open-below",
      label: "Split horizontally",
      group: "Tabs",
      keywords: ["split", "stacked", "pane", "below", "horizontal", "row"],
      icon: <SplitViewStackedIcon size={15} />,
      shortcut: "openBelow",
      hint: shortcutDefinition("openBelow").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: () => splitPane(store, "horizontal"),
    },
    {
      id: "cycle-pane-next",
      label: "Cycle to next pane",
      group: "Tabs",
      keywords: ["split", "pane", "cycle", "focus", "next"],
      icon: <ArrowRightIcon size={15} />,
      shortcut: "cyclePaneNext",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => cyclePaneInDirection(store, 1),
    },
    {
      id: "cycle-pane-previous",
      label: "Cycle to previous pane",
      group: "Tabs",
      keywords: ["split", "pane", "cycle", "focus", "previous"],
      icon: <ArrowLeftIcon size={15} />,
      shortcut: "cyclePanePrevious",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => cyclePaneInDirection(store, -1),
    },
    {
      id: "close-split",
      label: "Close split view",
      group: "Tabs",
      keywords: ["split", "pane"],
      icon: <SplitViewCloseIcon size={15} />,
      shortcut: "closeSplit",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => closeSplit(store),
    },
    {
      id: "toggle-split-orientation",
      label: "Toggle split orientation",
      group: "Tabs",
      keywords: ["split", "pane", "stack", "vertical", "horizontal", "side by side"],
      icon: <SplitViewStackedIcon size={15} />,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => toggleSplitOrientation(store),
    },
    {
      id: "reset-split-size",
      label: "Reset split size",
      group: "Tabs",
      keywords: ["split", "pane", "divider", "even", "reset"],
      icon: <RotateCcwIcon size={15} />,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => resetSplitRatio(store),
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
      id: "import-markdown-file",
      label: "Import markdown file…",
      group: "Actions",
      keywords: ["import", "markdown", "file", "single", "note"],
      icon: <UploadIcon size={15} />,
      shortcut: "importMarkdownFile",
      hint: shortcutDefinition("importMarkdownFile").description,
      run: () => {
        void runImportMarkdownFile(store, controls);
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
        "joplin",
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
        "evernote",
        "enex",
        "keep",
        "standard notes",
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
      id: "cloud-sign-in",
      label: "Sign in to Skriuw cloud",
      group: "General",
      keywords: ["account", "login", "log in", "cloud", "sync"],
      icon: <UserIcon size={15} />,
      visible: () => authConfiguration.available,
      run: controls.openSignIn,
    },
    {
      id: "show-shortcut-help",
      label: "Show keyboard shortcuts",
      group: "General",
      keywords: ["cheat sheet", "keybindings", "help"],
      icon: <KeyboardIcon size={15} />,
      shortcut: "showShortcutHelp",
      run: controls.showShortcutHelp,
    },
    {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "Navigation",
      icon: <PanelLeftToggleIcon size={15} />,
      shortcut: "toggleSidebar",
      enabled: onSidebarRoute,
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
      icon: <PanelLeftIcon size={15} />,
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
      id: "collapse-all-folders",
      label: "Collapse all folders",
      group: "Navigation",
      keywords: ["fold", "collapse", "tree", "sidebar", "folders"],
      icon: <FoldVerticalIcon size={15} />,
      shortcut: "collapseAllFolders",
      enabled: (state, ui) => onNotesRoute(state, ui) && ui.sidebarOpen,
      run: () => setAllFoldersExpanded(store, false),
    },
    {
      id: "focus-editor",
      label: "Focus editor",
      group: "Navigation",
      icon: <TypeIcon size={15} />,
      shortcut: "focusEditor",
      hint: shortcutDefinition("focusEditor").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: () => {
        const state = store.getState();
        const paneIndex = state.panes.findIndex(
          (pane) => pane.paneId === state.focusedPaneId,
        );
        if (state.panes.length > 1 && paneIndex >= 0 && focusEditorPane(paneIndex)) {
          return;
        }
        focusRegion("editor");
      },
    },
    {
      id: "focus-pane-left",
      label: "Focus pane to the left",
      group: "Navigation",
      keywords: ["split", "pane", "focus"],
      icon: <ArrowLeftIcon size={15} />,
      shortcut: "focusPaneLeft",
      hint: shortcutDefinition("focusPaneLeft").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => focusPaneInDirection(store, -1),
    },
    {
      id: "focus-pane-right",
      label: "Focus pane to the right",
      group: "Navigation",
      keywords: ["split", "pane", "focus"],
      icon: <ArrowRightIcon size={15} />,
      shortcut: "focusPaneRight",
      hint: shortcutDefinition("focusPaneRight").description,
      enabled: (state, ui) => onNotesRoute(state, ui) && state.panes.length > 1,
      run: () => focusPaneInDirection(store, 1),
    },
    {
      id: "focus-metadata",
      label: "Focus metadata panel",
      group: "Navigation",
      icon: <PanelRightIcon size={15} />,
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
      id: "go-to-journal",
      label: "Go to journal",
      group: "Navigation",
      keywords: ["journal", "diary", "calendar", "day"],
      icon: <CalendarDaysIcon size={15} />,
      shortcut: "goToJournal",
      visible: (_state, ui) => ui.route !== "journal",
      run: () => controls.navigate("journal"),
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
      id: "journal-focus-search",
      label: "Search journal entries",
      group: "Journal",
      keywords: ["journal", "search", "find", "entry"],
      icon: <SearchIcon size={15} />,
      shortcut: "journalFocusSearch",
      hint: shortcutDefinition("journalFocusSearch").description,
      enabled: onJournalRoute,
      run: () => {
        controls.openSidebar();
        requestJournalSearchFocus();
      },
    },
    {
      id: "journal-today",
      label: "Go to today's entry",
      group: "Journal",
      keywords: ["journal", "today", "now"],
      icon: <CalendarDaysIcon size={15} />,
      shortcut: "journalToday",
      enabled: onJournalRoute,
      run: openJournalToday,
    },
    {
      id: "journal-previous-day",
      label: "Previous day",
      group: "Journal",
      keywords: ["journal", "yesterday", "back", "day"],
      icon: <ChevronLeftIcon size={15} />,
      shortcut: "journalPreviousDay",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(-1),
    },
    {
      id: "journal-next-day",
      label: "Next day",
      group: "Journal",
      keywords: ["journal", "tomorrow", "forward", "day"],
      icon: <ChevronRightIcon size={15} />,
      shortcut: "journalNextDay",
      enabled: onJournalRoute,
      run: () => openJournalDayOffset(1),
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
