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
 * Number of tab slots the strip shows at `availableWidth` for `tabCount` open
 * tabs. Two widths with the same capacity split the tabs identically, so a
 * resize only needs to re-render the strip when the capacity changes.
 */
export function tabCapacity(tabCount: number, availableWidth: number): number {
  if (availableWidth <= 0 || tabCount * MIN_TAB_WIDTH <= availableWidth) {
    return tabCount;
  }
  return Math.max(1, Math.floor((availableWidth - OVERFLOW_TRIGGER_WIDTH) / MIN_TAB_WIDTH));
}

/**
 * Splits `tabs` into the ones the strip renders and the ones the overflow menu
 * holds. A non-positive `availableWidth` (before first layout) keeps every tab
 * visible so the strip never flashes an overflow trigger it does not need.
 */
export function splitTabsForWidth<T extends OverflowInput>(
  tabs: readonly T[],
  availableWidth: number,
): TabOverflow<T> {
  const slots = tabCapacity(tabs.length, availableWidth);
  if (slots >= tabs.length) {
    return { visible: [...tabs], overflow: [] };
  }

  const kept = new Set(tabs.filter((tab) => tab.isPinned || tab.isActive).map((tab) => tab.id));
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
