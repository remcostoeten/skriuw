import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import { opensNotesInTabs } from "@skriuw/renderer-core/settings/open-notes-in-tabs";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { shortcutDefinition } from "@/commands/bindings";
import { TAB_INDEX_ACTION_IDS } from "@/commands/definitions";
import {
  focusEditorPane,
  focusMainContent,
  focusRegion,
  focusedPaneIndex,
} from "@/commands/focus-regions";
import { onRoute, type AppCommand, type CommandPredicate } from "@/commands/registry";
import { quitApp, toggleMaximize } from "@/platform/desktop/window";
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
} from "@/features/workspace-layout/panes";
import { navigateNote, noteNavigationOrder } from "@/features/notes/navigation";
import { setAllFoldersExpanded } from "@/features/sidebar/tree-state";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  CloseIcon,
  EnterFullscreenIcon,
  FoldVerticalIcon,
  FolderOpenIcon,
  ListTodoIcon,
  MaximizeIcon,
  PanelLeftIcon,
  PanelRightIcon,
  RotateCcwIcon,
  SplitViewCloseIcon,
  SplitViewIcon,
  SplitViewStackedIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  WaypointsIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/shared/icons/static";
import { routeHasSidebar } from "./panels";
import { resetZoom, zoomIn, zoomOut } from "./zoom";

export type ShellCommandControls = {
  toggleSidebar: () => void;
  toggleMetadata: () => void;
  toggleFocusMode: () => void;
  navigate: (route: AppRoute) => void;
};

const onNotesRoute = onRoute("notes");

const onSidebarRoute: CommandPredicate = (_state, ui) => routeHasSidebar(ui.route);

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
 * Focuses the editor of the pane that had focus last, or the lone editor.
 * False when no editor is showing, e.g. off the notes route.
 */
function focusActiveEditor(store: RendererStore): boolean {
  const state = store.getState();
  const paneIndex = state.panes.findIndex((pane) => pane.paneId === state.focusedPaneId);
  if (state.panes.length > 1 && paneIndex >= 0 && focusEditorPane(paneIndex)) {
    return true;
  }
  return focusRegion("editor");
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

export function shellCommands(store: RendererStore, controls: ShellCommandControls): AppCommand[] {
  return [
    {
      id: "toggle-focus-mode",
      label: "Toggle focus mode",
      group: "Actions",
      keywords: ["focus", "zen", "distraction", "free", "hide", "chrome", "fullscreen", "writing"],
      icon: <EnterFullscreenIcon size={15} />,
      shortcut: "toggleFocusMode",
      enabled: onNotesRoute,
      run: controls.toggleFocusMode,
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
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "Navigation",
      icon: <PanelLeftIcon size={15} />,
      shortcut: "toggleSidebar",
      enabled: onSidebarRoute,
      run: controls.toggleSidebar,
    },
    {
      id: "toggle-metadata",
      label: "Toggle metadata panel",
      group: "Navigation",
      icon: <PanelRightIcon size={15} />,
      shortcut: "toggleMetadata",
      enabled: onNotesRoute,
      run: controls.toggleMetadata,
    },
    {
      id: "focus-sidebar",
      label: "Focus sidebar",
      group: "Navigation",
      icon: <PanelLeftIcon size={15} />,
      shortcut: "focusSidebar",
      enabled: (state, ui) => onNotesRoute(state, ui) && ui.sidebarOpen,
      run: () => {
        const firstVisibleId = store.getState().visibleIds[0];
        if (firstVisibleId) {
          store.setFocusedNode(firstVisibleId);
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
        focusActiveEditor(store);
      },
    },
    {
      id: "focus-main-content",
      label: "Focus main content",
      group: "Navigation",
      keywords: ["main", "content", "focus", "view"],
      icon: <TypeIcon size={15} />,
      shortcut: "focusMainContent",
      hint: shortcutDefinition("focusMainContent").description,
      run: () => {
        if (focusActiveEditor(store)) {
          return;
        }
        focusMainContent();
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
      id: "go-to-tasks",
      label: "Go to tasks",
      group: "Navigation",
      keywords: ["task", "todo", "checklist", "done"],
      icon: <ListTodoIcon size={15} />,
      shortcut: "goToTasks",
      visible: (_state, ui) => ui.route !== "tasks",
      run: () => controls.navigate("tasks"),
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
