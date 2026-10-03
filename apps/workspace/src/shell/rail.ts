import type { RailItem } from "@/commands/rail-items";
import type { AppIconName } from "@/shared/icons/app-icon";

/** Icon for each rail destination, shared by the desktop rail and the compact tab bar. */
export const RAIL_ICONS: Record<RailItem["actionId"], AppIconName> = {
  goToNotes: "notes",
  goToJournal: "journal",
  goToTasks: "tasks",
  goToTags: "tags",
  goToPeople: "people",
  goToTrash: "trash",
};

/** Shared chrome for the square buttons and links in the primary navigation rail. */
export const railIconButtonClass =
  "relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200 pointer-coarse:h-11 pointer-coarse:w-11";

export const railInactiveClass =
  "border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

export const railActiveClass =
  "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none";
