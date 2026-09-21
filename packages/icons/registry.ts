import type { GlyphName } from "./catalog";
import type { AnimatedIconId } from "./parts";

export type IconEntry = {
  readonly glyph: GlyphName;
  /** The hover animation, drawn on the same glyph so rest matches the static icon. */
  readonly motion?: AnimatedIconId;
};

/**
 * Icons named by the action they stand for, shared by the desktop `AppIcon`
 * and the mobile shell. Naming the action rather than the glyph lets both
 * platforms swap a drawing in one place. Notes is the open folder on both.
 */
export const ICON_REGISTRY = {
  notes: { glyph: "folder_open", motion: "notes" },
  journal: { glyph: "calendar_ltr", motion: "journal" },
  tasks: { glyph: "task_list_ltr", motion: "tasks" },
  tags: { glyph: "tag", motion: "tags" },
  people: { glyph: "people", motion: "people" },
  trash: { glyph: "delete", motion: "trash" },
  settings: { glyph: "settings", motion: "settings" },
  search: { glyph: "search", motion: "search" },
  "find-in-note": { glyph: "search", motion: "search" },
  "new-note": { glyph: "note_edit", motion: "newnote" },
  "new-folder": { glyph: "folder_add" },
  plus: { glyph: "add", motion: "plus" },
  close: { glyph: "dismiss", motion: "close" },
  menu: { glyph: "navigation", motion: "menu" },
  more: { glyph: "more_horizontal", motion: "more" },
  pin: { glyph: "pin", motion: "pin" },
  lock: { glyph: "lock_closed", motion: "lock" },
  "version-history": { glyph: "history", motion: "history" },
  "toggle-sidebar": { glyph: "panel_left", motion: "sidebar" },
  "toggle-metadata": { glyph: "panel_right", motion: "metadata" },
  sync: { glyph: "arrow_sync", motion: "sync" },
  account: { glyph: "person_circle", motion: "account" },
  "previous-note": { glyph: "chevron_left", motion: "back" },
  "next-note": { glyph: "chevron_right", motion: "fwd" },
  back: { glyph: "chevron_left", motion: "back" },
  forward: { glyph: "chevron_right", motion: "fwd" },
  folder: { glyph: "folder" },
  chevron: { glyph: "chevron_right" },
  bold: { glyph: "text_bold", motion: "bold" },
  italic: { glyph: "text_italic", motion: "italic" },
  heading: { glyph: "text_header_1", motion: "heading" },
  link: { glyph: "link", motion: "link" },
  quote: { glyph: "text_quote", motion: "quote" },
  code: { glyph: "code", motion: "code" },
  image: { glyph: "image", motion: "image" },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICON_REGISTRY;

export const ICON_NAMES = Object.keys(ICON_REGISTRY) as IconName[];
