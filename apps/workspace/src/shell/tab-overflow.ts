/**
 * Tab strip overflow model.
 *
 * The strip lays tabs out at a readable width instead of squeezing every open
 * note into the available space. Whatever does not fit moves behind a trailing
 * "N more" trigger; pinned tabs and the active tab always stay on the strip.
 */

export const MIN_TAB_WIDTH = 132;
export const MAX_TAB_WIDTH = 200;
const OVERFLOW_TRIGGER_WIDTH = 80;

type OverflowInput = {
  id: string;
  isActive: boolean;
  isPinned: boolean;
};

export type TabOverflow<T> = {
  visible: T[];
  overflow: T[];
};

/**
 * Splits `tabs` into the ones the strip renders and the ones the overflow menu
 * holds. A non-positive `availableWidth` (before first layout) keeps every tab
 * visible so the strip never flashes an overflow trigger it does not need.
 */
export function splitTabsForWidth<T extends OverflowInput>(
  tabs: readonly T[],
  availableWidth: number,
): TabOverflow<T> {
  if (availableWidth <= 0 || tabs.length === 0) {
    return { visible: [...tabs], overflow: [] };
  }
  if (tabs.length * MIN_TAB_WIDTH <= availableWidth) {
    return { visible: [...tabs], overflow: [] };
  }

  const slots = Math.max(
    1,
    Math.floor((availableWidth - OVERFLOW_TRIGGER_WIDTH) / MIN_TAB_WIDTH),
  );
  const kept = new Set(
    tabs.filter((tab) => tab.isPinned || tab.isActive).map((tab) => tab.id),
  );
  for (const tab of tabs) {
    if (kept.size >= slots) {
      break;
    }
    kept.add(tab.id);
  }

  const visible: T[] = [];
  const overflow: T[] = [];
  for (const tab of tabs) {
    (kept.has(tab.id) ? visible : overflow).push(tab);
  }
  return visible.length === tabs.length ? { visible, overflow: [] } : { visible, overflow };
}
