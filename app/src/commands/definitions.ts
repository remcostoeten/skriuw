import { RAIL_ITEMS, railModShiftKeys, railSequenceKeys } from "./rail-items";

/**
 * Direct tab access, in strip order. Generated so the digit keys and the
 * palette commands stay derived from one list instead of ten hand-written
 * copies.
 */
export const TAB_INDEX_ACTION_IDS = [
  "openTab1",
  "openTab2",
  "openTab3",
  "openTab4",
  "openTab5",
  "openTab6",
  "openTab7",
  "openTab8",
  "openTab9",
] as const;

export type TabIndexActionId = (typeof TAB_INDEX_ACTION_IDS)[number];

export type ShortcutActionId =
  | TabIndexActionId
  | "openLastTab"
  | "toggleCommandPalette"
  | "showShortcutHelp"
  | "createNote"
  | "createNoteFromTemplate"
  | "createFolder"
  | "createTag"
  | "createPerson"
  | "togglePinNote"
  | "toggleEditorMode"
  | "renameCurrentNote"
  | "trashCurrentNote"
  | "duplicateCurrentNote"
  | "importMarkdownFile"
  | "closeTab"
  | "reopenClosedTab"
  | "moveTabLeft"
  | "moveTabRight"
  | "nextTab"
  | "previousTab"
  | "openBeside"
  | "openBelow"
  | "closeSplit"
  | "cyclePaneNext"
  | "cyclePanePrevious"
  | "openSettings"
  | "toggleSidebar"
  | "toggleMetadata"
  | "focusSidebar"
  | "collapseAllFolders"
  | "focusEditor"
  | "focusMetadata"
  | "focusPaneLeft"
  | "focusPaneRight"
  | "previousNote"
  | "nextNote"
  | "goToNotes"
  | "goToJournal"
  | "goToTasks"
  | "goToTags"
  | "goToPeople"
  | "goToTrash"
  | "journalFocusSearch"
  | "journalToday"
  | "journalPreviousDay"
  | "journalNextDay"
  | "toggleMaximize"
  | "quitApp"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "insertLink"
  | "toggleChecklistItem"
  | "jumpToLine"
  | "goToDocumentStart"
  | "goToDocumentEnd"
  | "findInNote"
  | "findAndReplaceInNote"
  | "searchMatchCase"
  | "searchWholeWord"
  | "searchRegex";

/**
 * Focus contexts that veto a binding:
 * - `typing` — any text field or contenteditable, including the note editor.
 * - `textField` — native text fields only, so editor-scoped keys still fire
 *   while the caret is in the note.
 * - `sidebarTree` — the tree owns its plain keys (F2/r, Delete, m, alt+arrows)
 *   for the focused row and keeps precedence over same-key global bindings.
 * - `modal` — a dialog or the command palette owns the keyboard.
 */
export type ShortcutGuard = "typing" | "textField" | "sidebarTree" | "modal";

/** Runtime platforms, matching `detectPlatform()` from the shortcut package. */
export type ShortcutPlatform = "mac" | "windows" | "linux";

export type ShortcutDefinition = {
  id: ShortcutActionId;
  keys: string | string[];
  label: string;
  group: string;
  /**
   * Longer note for discovery UI, e.g. when the binding deliberately overrides
   * a native key. Falls back to `label`.
   */
  description?: string;
  /** Extra focus contexts where the binding must stay silent. */
  guards?: readonly ShortcutGuard[];
  /**
   * Platforms where the default combo is registered. Omitted means every
   * platform. Lets a default stay off a platform that already owns the combo,
   * while a user override still binds everywhere.
   */
  platforms?: readonly ShortcutPlatform[];
  /**
   * Named scopes the binding requires to fire. Bindings with scopes run only
   * when the workspace has at least one matching scope active, letting a key
   * like `mod+n` mean different things per route.
   */
  scopes?: string | string[];
  /**
   * Scopes that must *all* be active, where `scopes` needs only one. For a
   * binding whose command is gated on two independent conditions at once, like
   * find-in-note wanting both the notes route and a focused editor.
   */
  allScopes?: readonly string[];
  /**
   * Modifier combos that should keep working while the caret is in the
   * ProseMirror editor or an input. Plain-key shortcuts must leave this off so
   * they never steal typed characters.
   */
  worksWhileTyping?: boolean;
  secondaryKeys?: string;
  /**
   * Whether `secondaryKeys` also survives typing. Off by default: alternates
   * are usually plain keys that must never steal a typed character.
   */
  secondaryWorksWhileTyping?: boolean;
  boundInEditor?: boolean;
  /**
   * An action this binding deliberately shares a combo with. Legal only when
   * the two are arbitrated per keypress rather than by scopes or guards: the
   * editor-bound holder claims the event when it can act on it and otherwise
   * leaves it alone to reach the window binding. The overlap tests exempt the
   * declared pair, so nothing else can share a combo by accident.
   */
  sharesComboWith?: ShortcutActionId;
};

const TAB_INDEX_DESCRIPTION =
  "Activate a tab by its position in the focused pane's strip. Alt keeps the digits clear of the mod+digit focus and zoom bindings, and browsers own ctrl+digits for their own tabs — so the combo is reliable on desktop and best-effort on web.";

/**
 * `alt+1`…`alt+9` plus `alt+0` for the last tab, VS Code style. Nothing fires
 * unless the `tabs` scope is active, so with the tabbed workspace off the
 * keypress falls through untouched.
 */
const TAB_INDEX_DEFINITIONS: readonly ShortcutDefinition[] = [
  ...TAB_INDEX_ACTION_IDS.map((id, index) => ({
    id,
    keys: `alt+${index + 1}`,
    label: `Go to tab ${index + 1}`,
    description: TAB_INDEX_DESCRIPTION,
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"] as const,
    scopes: "tabs",
  })),
  {
    id: "openLastTab",
    keys: "alt+0",
    label: "Go to last tab",
    description: TAB_INDEX_DESCRIPTION,
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"] as const,
    scopes: "tabs",
  },
];

/**
 * `mod+shift+<n>`, one per rail item, numbered in visual order. Trash keeps
 * its existing `g then t then 5` alternate; primary rail destinations do not
 * use sequence shortcuts. Every binding stays silent behind a modal so the
 * command palette and settings keep ownership of the keyboard.
 */
const RAIL_NAVIGATION_DEFINITIONS: readonly ShortcutDefinition[] = RAIL_ITEMS.map(
  (item, index) => {
    const position = index + 1;
    const destination = item.label.toLowerCase();
    return {
      id: item.actionId,
      keys: railModShiftKeys(position),
      secondaryKeys: item.section === "utility" ? railSequenceKeys(position) : undefined,
      label: `Go to ${destination}`,
      description:
        item.section === "utility"
          ? `Go to ${destination}. Also fires as g then t then ${position}.`
          : `Go to ${destination}.`,
      group: "Navigation",
      worksWhileTyping: true,
      guards: ["modal"],
    };
  },
);

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: "toggleCommandPalette",
    keys: "mod+k",
    secondaryKeys: "mod+shift+p",
    secondaryWorksWhileTyping: true,
    label: "Open command palette",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "showShortcutHelp",
    keys: "mod+slash",
    label: "Show keyboard shortcuts",
    description:
      "Open the cheat sheet listing every shortcut, grouped by area, with the combos currently bound. A deliberate chord, so it also fires from inside a note; the overlay itself owns Escape and a second press closes it.",
    group: "General",
    worksWhileTyping: true,
    guards: ["modal"],
  },
  {
    id: "createNote",
    keys: "mod+n",
    label: "New note",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "createNoteFromTemplate",
    keys: "mod+alt+n",
    label: "New note from template",
    description:
      "Open the template picker and create a note from the chosen scaffold. Complements mod+n, which creates a blank note.",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "note-create",
  },
  {
    id: "createFolder",
    keys: "mod+shift+n",
    label: "New folder",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "createTag",
    keys: "mod+shift+t",
    label: "New tag",
    group: "Workspace",
    worksWhileTyping: true,
    scopes: "tags-route",
  },
  {
    id: "createPerson",
    keys: "mod+shift+u",
    label: "New person",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "togglePinNote",
    keys: "mod+p",
    label: "Pin or unpin current note",
    description:
      "Pin or unpin the current note. While the sidebar tree has focus it targets the focused row instead of the note the editor shows.",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "renameCurrentNote",
    keys: "f2",
    label: "Rename current note",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["textField", "sidebarTree", "modal"],
    scopes: "notes-route",
  },
  {
    id: "trashCurrentNote",
    keys: "mod+backspace",
    secondaryKeys: "mod+delete",
    label: "Move current note to trash",
    description:
      "Move current note to trash. Stays silent while the caret is in a note or text field, so mod+backspace keeps its delete-word meaning there.",
    group: "Workspace",
    guards: ["sidebarTree", "modal"],
    scopes: "notes-route",
  },
  {
    id: "duplicateCurrentNote",
    keys: "mod+shift+d",
    label: "Duplicate current note",
    description:
      "Duplicate the sidebar's focused note, or the open one, and rename the copy. Overrides the browser's bookmark-all-tabs default on web.",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["textField", "modal"],
    scopes: "notes-route",
  },
  {
    id: "importMarkdownFile",
    keys: "ctrl+shift+o",
    label: "Import markdown file",
    description:
      "Import a single .md, .markdown, or .txt file as a new note, through the same pipeline as Import notes from folder. Flushes pending edits first and ignores a second press while an import is already running.",
    group: "Workspace",
    worksWhileTyping: true,
    guards: ["modal"],
  },
  {
    id: "toggleEditorMode",
    keys: "mod+m",
    label: "Toggle raw Markdown mode",
    group: "Workspace",
    worksWhileTyping: true,
  },
  {
    id: "closeTab",
    keys: "mod+w",
    label: "Close tab",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "reopenClosedTab",
    keys: "mod+shift+w",
    label: "Reopen closed tab",
    description:
      "Reopen the last tab closed in this pane at its old position, walking back through the ten most recent. Browser muscle memory says ctrl+shift+t, but that belongs to New tag — this is the undo of Close tab instead.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "moveTabLeft",
    keys: "ctrl+shift+pageup",
    label: "Move tab left",
    description:
      "Move the active tab one slot left, wrapping at the ends. Browsers own this combo for their own tab strip, so it is reliable on desktop and best-effort on web.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "moveTabRight",
    keys: "ctrl+shift+pagedown",
    label: "Move tab right",
    description:
      "Move the active tab one slot right, wrapping at the ends. Browsers own this combo for their own tab strip, so it is reliable on desktop and best-effort on web.",
    group: "Tabs",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "tabs",
  },
  {
    id: "nextTab",
    keys: "ctrl+tab",
    label: "Next tab",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "previousTab",
    keys: "ctrl+shift+tab",
    label: "Previous tab",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  ...TAB_INDEX_DEFINITIONS,
  {
    id: "openBeside",
    keys: "mod+alt+v",
    label: "Split vertically",
    description:
      "Open the current note in a second pane beside this one. With a split already open it only re-lays the panes side by side, keeping whatever each one holds.",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "openBelow",
    keys: "mod+alt+h",
    label: "Split horizontally",
    description:
      "Open the current note in a second pane below this one. With a split already open it only re-lays the panes stacked, keeping whatever each one holds.",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "closeSplit",
    keys: "mod+alt+w",
    label: "Close split view",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "cyclePaneNext",
    keys: "mod+alt+tab",
    label: "Cycle to next pane",
    description:
      "Move keyboard focus to the next pane, wrapping at the end. Some Linux desktops claim ctrl+alt+tab for their own window switching, so rebind if the OS wins.",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "split",
  },
  {
    id: "cyclePanePrevious",
    keys: "mod+alt+shift+tab",
    label: "Cycle to previous pane",
    description:
      "Move keyboard focus to the previous pane, wrapping at the start. Some Linux desktops claim ctrl+alt+tab for their own window switching, so rebind if the OS wins.",
    group: "Tabs",
    worksWhileTyping: true,
    scopes: "split",
  },
  {
    id: "openSettings",
    keys: "mod+,",
    label: "Open settings",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "toggleSidebar",
    keys: "mod+b",
    label: "Toggle sidebar",
    group: "Navigation",
    worksWhileTyping: true,
    scopes: "sidebar-route",
  },
  {
    id: "toggleMetadata",
    keys: "ctrl+shift+b",
    label: "Toggle metadata panel",
    group: "Navigation",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "focusSidebar",
    keys: "mod+e",
    label: "Focus current note in sidebar",
    group: "Navigation",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "collapseAllFolders",
    keys: "mod+shift+e",
    label: "Collapse all folders",
    description:
      "Collapse every folder in the sidebar tree, the shifted sibling of mod+e's reveal-in-sidebar.",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "notes-route",
  },
  {
    id: "focusEditor",
    keys: "mod+2",
    secondaryKeys: "slash",
    label: "Focus editor",
    description:
      "Focus the editor content. With a split open this returns to the pane that had focus last, so it composes with the directional pane keys. Notes-only, matching the command behind it — which also keeps the plain-key alternate off the journal, where / opens the entry search instead.",
    group: "Navigation",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "focusPaneLeft",
    keys: "mod+alt+arrowleft",
    label: "Focus pane to the left",
    description:
      "Move keyboard focus to the split pane on the left. Three modifiers keep it clear of every native word and line motion; some Linux desktops and macOS apps claim mod+alt+arrows, so rebind if the OS wins.",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "split",
  },
  {
    id: "focusPaneRight",
    keys: "mod+alt+arrowright",
    label: "Focus pane to the right",
    description:
      "Move keyboard focus to the split pane on the right. Three modifiers keep it clear of every native word and line motion; some Linux desktops and macOS apps claim mod+alt+arrows, so rebind if the OS wins.",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "split",
  },
  {
    id: "focusMetadata",
    keys: "mod+3",
    label: "Focus metadata panel",
    group: "Navigation",
    worksWhileTyping: true,
    scopes: "notes-route",
  },
  {
    id: "previousNote",
    keys: "ctrl+shift+bracketleft",
    label: "Previous note",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "notes-route",
  },
  {
    id: "nextNote",
    keys: "ctrl+shift+bracketright",
    label: "Next note",
    group: "Navigation",
    worksWhileTyping: true,
    guards: ["modal"],
    scopes: "notes-route",
  },
  ...RAIL_NAVIGATION_DEFINITIONS,
  {
    id: "journalFocusSearch",
    keys: "slash",
    label: "Search journal entries",
    description:
      "Open the journal sidebar on its search tab and put the caret in the field. A plain key, so it only fires while the caret is outside the entry — typing a slash into today's entry is untouched.",
    group: "Journal",
    guards: ["modal"],
    scopes: "journal",
  },
  {
    id: "journalToday",
    keys: "t",
    label: "Go to today's entry",
    group: "Journal",
    guards: ["modal"],
    scopes: "journal",
  },
  {
    id: "journalPreviousDay",
    keys: "bracketleft",
    label: "Previous day",
    group: "Journal",
    guards: ["modal"],
    scopes: "journal",
  },
  {
    id: "journalNextDay",
    keys: "bracketright",
    label: "Next day",
    group: "Journal",
    guards: ["modal"],
    scopes: "journal",
  },
  {
    id: "toggleMaximize",
    keys: "mod+enter",
    label: "Toggle maximize",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "quitApp",
    keys: "mod+shift+q",
    label: "Quit",
    group: "General",
    worksWhileTyping: true,
  },
  {
    id: "zoomIn",
    keys: "mod+equal",
    label: "Zoom in",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "zoomOut",
    keys: "mod+minus",
    label: "Zoom out",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "zoomReset",
    keys: "mod+0",
    label: "Reset zoom",
    group: "View",
    worksWhileTyping: true,
  },
  {
    id: "insertLink",
    keys: "mod+k",
    secondaryKeys: "mod+shift+k",
    secondaryWorksWhileTyping: true,
    label: "Insert or edit link",
    description:
      "Wrap the selected text in a link, or edit the link under the caret. Shares mod+k with the command palette the way Notion does: with a text selection the key means link, and with none it falls through to the palette.",
    group: "Editor",
    worksWhileTyping: true,
    boundInEditor: true,
    sharesComboWith: "toggleCommandPalette",
  },
  {
    id: "toggleChecklistItem",
    keys: "alt+shift+enter",
    label: "Toggle checklist item",
    description: "Toggle the checkbox containing the editor caret.",
    group: "Editor",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "jumpToLine",
    keys: "mod+g",
    label: "Jump to line",
    description:
      "Toggle the jump-to-line field. Line numbers mean lines of the note's Markdown in both modes, so the same number lands on the same content. Overrides Firefox's find-again default on web.",
    group: "Editor",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "goToDocumentStart",
    keys: "ctrl+arrowup",
    label: "Jump to start of note",
    description:
      "Move the caret and scroll to the very start of the note. VS Code scrolls the viewport with this combo instead; on macOS cmd+arrowup does this natively, so the default stays unregistered there.",
    group: "Editor",
    worksWhileTyping: true,
    platforms: ["windows", "linux"],
    boundInEditor: true,
  },
  {
    id: "goToDocumentEnd",
    keys: "ctrl+arrowdown",
    label: "Jump to end of note",
    description:
      "Move the caret and scroll to the very end of the note. VS Code scrolls the viewport with this combo instead; on macOS cmd+arrowdown does this natively, so the default stays unregistered there.",
    group: "Editor",
    worksWhileTyping: true,
    platforms: ["windows", "linux"],
    boundInEditor: true,
  },
  {
    id: "findInNote",
    keys: "mod+f",
    label: "Find in note",
    description:
      "Toggle the find panel — a second press closes it and returns focus to the note.",
    group: "Editor search",
    worksWhileTyping: true,
    allScopes: ["notes-route", "note-focus"],
  },
  {
    id: "findAndReplaceInNote",
    keys: "mod+h",
    secondaryKeys: "mod+alt+f",
    secondaryWorksWhileTyping: true,
    label: "Find and replace in note",
    description:
      "Open the find panel with the replace row expanded. Overrides the browser's history shortcut on web; mod+alt+f is VS Code's macOS default, where cmd+h hides the app.",
    group: "Editor search",
    worksWhileTyping: true,
    allScopes: ["notes-route", "note-focus"],
  },
  {
    id: "searchMatchCase",
    keys: "alt+c",
    label: "Toggle match case",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "searchWholeWord",
    keys: "alt+w",
    label: "Toggle whole word",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
  {
    id: "searchRegex",
    keys: "alt+r",
    label: "Toggle regular expression",
    group: "Editor search",
    worksWhileTyping: true,
    boundInEditor: true,
  },
];
