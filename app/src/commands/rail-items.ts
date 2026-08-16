import type { AppRoute } from "@/app-route";

export type RailItemActionId =
  | "goToNotes"
  | "goToJournal"
  | "goToTasks"
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
 * Sidebar icon rail destinations, top to bottom. The single source for the
 * rendered rail (`app.tsx`) and its numbered `mod+shift+<n>` shortcuts.
 */
export const RAIL_ITEMS: readonly RailItem[] = [
  { actionId: "goToNotes", route: "notes", label: "Notes", section: "primary" },
  { actionId: "goToJournal", route: "journal", label: "Journal", section: "primary" },
  { actionId: "goToTasks", route: "tasks", label: "Tasks", section: "primary" },
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
