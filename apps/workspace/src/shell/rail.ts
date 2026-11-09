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

/** Shared chrome for the rows in the primary navigation rail: an icon, then a label shown when the rail is wide. */
export const railItemClass =
  "relative flex h-9 w-full shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-[11px] text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.35)] active:scale-[0.97] pointer-coarse:h-11";

export const railIconButtonClass =
  "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 pointer-coarse:h-11 pointer-coarse:w-11";

export const railInactiveClass =
  "text-sidebar-foreground/52 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/90";

export const railActiveClass = "bg-sidebar-accent/75 text-sidebar-accent-foreground";

const RAIL_LABELS_STORAGE_KEY = "skriuw.rail-labels";

/**
 * @name readRailLabels
 * @description Whether the primary rail was last left wide, with its labels
 * shown. Falls back to the icon-only rail when storage is unavailable.
 *
 * @example
 * const [railLabels, setRailLabels] = useState(readRailLabels);
 */
export function readRailLabels(): boolean {
  try {
    return window.localStorage.getItem(RAIL_LABELS_STORAGE_KEY) === "shown";
  } catch {
    return false;
  }
}

/**
 * @name writeRailLabels
 * @description Remembers whether the primary rail shows its labels.
 *
 * @example
 * writeRailLabels(true);
 */
export function writeRailLabels(shown: boolean): void {
  try {
    window.localStorage.setItem(RAIL_LABELS_STORAGE_KEY, shown ? "shown" : "hidden");
  } catch {
    return;
  }
}
