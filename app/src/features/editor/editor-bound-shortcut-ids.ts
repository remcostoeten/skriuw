import type { ShortcutActionId } from "@/commands/definitions";

/**
 * The editor-bound shortcut ids each editor surface handles. Definitions
 * flagged `boundInEditor` are skipped by the command registry, so nothing at
 * the command layer proves they are wired — these lists close that gap.
 *
 * Each surface types its handler map against its own list, so a list can never
 * drift from the handlers it names, and `EDITOR_BOUND_SHORTCUT_IDS` is asserted
 * against every `boundInEditor` definition in the tests. Together that keeps the
 * `mod+/` cheat sheet from advertising a key no surface listens for.
 */
export const NOTE_EDITOR_SHORTCUT_IDS = [
  "goToDocumentStart",
  "goToDocumentEnd",
  "insertLink",
  "commentOnSelection",
  "toggleChecklistItem",
  "jumpToLine",
] as const satisfies readonly ShortcutActionId[];

export const RAW_MARKDOWN_EDGE_SHORTCUT_IDS = [
  "goToDocumentStart",
  "goToDocumentEnd",
] as const satisfies readonly ShortcutActionId[];

export const RAW_MARKDOWN_SURFACE_SHORTCUT_IDS = [
  "jumpToLine",
] as const satisfies readonly ShortcutActionId[];

export const EDITOR_SEARCH_SHORTCUT_IDS = [
  "searchMatchCase",
  "searchWholeWord",
  "searchRegex",
] as const satisfies readonly ShortcutActionId[];

export type NoteEditorShortcutId = (typeof NOTE_EDITOR_SHORTCUT_IDS)[number];
export type RawMarkdownEdgeShortcutId = (typeof RAW_MARKDOWN_EDGE_SHORTCUT_IDS)[number];
export type RawMarkdownSurfaceShortcutId =
  (typeof RAW_MARKDOWN_SURFACE_SHORTCUT_IDS)[number];
export type EditorSearchShortcutId = (typeof EDITOR_SEARCH_SHORTCUT_IDS)[number];

/** Every id some editor surface handles, across all surfaces. */
export const EDITOR_BOUND_SHORTCUT_IDS: readonly ShortcutActionId[] = [
  ...NOTE_EDITOR_SHORTCUT_IDS,
  ...RAW_MARKDOWN_EDGE_SHORTCUT_IDS,
  ...RAW_MARKDOWN_SURFACE_SHORTCUT_IDS,
  ...EDITOR_SEARCH_SHORTCUT_IDS,
];
