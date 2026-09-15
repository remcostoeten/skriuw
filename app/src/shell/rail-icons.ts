import type { RailItem } from "@/commands/rail-items";
import type { AppIconName } from "@/shared/icons/registry";

/** Icon for each rail destination, shared by the desktop rail and the compact tab bar. */
export const RAIL_ICONS: Record<RailItem["actionId"], AppIconName> = {
  goToNotes: "notes",
  goToJournal: "journal",
  goToTasks: "tasks",
  goToTags: "tags",
  goToPeople: "people",
  goToTrash: "trash",
};
