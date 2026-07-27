import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import type { AppRoute } from "../app-route";

export type RailItemActionId =
  | "goToNotes"
  | "goToJournal"
  | "goToTags"
  | "goToPeople"
  | "goToTrash";

export type RailItem = {
  actionId: RailItemActionId;
  route: AppRoute;
  label: string;
  /** Where the icon sits in the rail: the scrollable group or the pinned utility row. */
  section: "primary" | "utility";
};

/**
 * Sidebar icon rail destinations, top to bottom. The single source for both
 * the rendered rail (`app.tsx`) and the `g then t then <n>` navigation
 * sequences generated in `definitions.ts`, so reordering an icon here
 * reorders its shortcut too.
 */
export const RAIL_ITEMS: readonly RailItem[] = [
  { actionId: "goToNotes", route: "notes", label: "Notes", section: "primary" },
  { actionId: "goToJournal", route: "journal", label: "Journal", section: "primary" },
  { actionId: "goToTags", route: "tags", label: "Tags", section: "primary" },
  { actionId: "goToPeople", route: "people", label: "People", section: "primary" },
  { actionId: "goToTrash", route: "trash", label: "Trash", section: "utility" },
];

/** The `g then t then <n>` combo string for a rail item's 1-based position. */
export function railSequenceKeys(position: number): string {
  return `g then t then ${position}`;
}

/** The `mod+shift+<n>` combo string for a rail item's 1-based position. */
export function railModShiftKeys(position: number): string {
  return `mod+shift+${position}`;
}

/** Display hint for the `g then t then <n>` sequence, one step at a time. */
export function formatRailSequenceHint(position: number): string {
  return railSequenceKeys(position)
    .split(" then ")
    .map((step) => formatShortcut(step))
    .join(" ");
}
