export type GridPosition = { row: number; column: number };

export type GridKey = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/**
 * Where a navigation key moves the active cell, or null when the key is not
 * a navigation key. Arrows step, Home/End reach the row's ends, the mod
 * variants reach the grid's corners, and Page keys move by one viewport.
 */
export function nextGridPosition(
  event: GridKey,
  position: GridPosition,
  rowCount: number,
  columnCount: number,
  pageRows: number,
): GridPosition | null {
  if (rowCount === 0 || columnCount === 0 || event.altKey) return null;
  const mod = event.ctrlKey || event.metaKey;
  const lastRow = rowCount - 1;
  const lastColumn = columnCount - 1;
  let { row, column } = position;
  switch (event.key) {
    case "ArrowUp":
      row = mod ? 0 : row - 1;
      break;
    case "ArrowDown":
      row = mod ? lastRow : row + 1;
      break;
    case "ArrowLeft":
      column = mod ? 0 : column - 1;
      break;
    case "ArrowRight":
      column = mod ? lastColumn : column + 1;
      break;
    case "Home":
      column = 0;
      if (mod) row = 0;
      break;
    case "End":
      column = lastColumn;
      if (mod) row = lastRow;
      break;
    case "PageUp":
      row -= Math.max(1, pageRows);
      break;
    case "PageDown":
      row += Math.max(1, pageRows);
      break;
    default:
      return null;
  }
  return {
    row: Math.min(lastRow, Math.max(0, row)),
    column: Math.min(lastColumn, Math.max(0, column)),
  };
}

/** The rating a digit key sets: 1 to 5, or 0 to clear. */
export function ratingKey(event: GridKey): number | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return /^[0-5]$/.test(event.key) ? Number(event.key) : null;
}

/**
 * The board card a key moves focus to, as [group, index]. Up and down stay in
 * the group; left and right keep the index, clamped to the next group's size.
 */
export function nextCardPosition(
  key: string,
  group: number,
  index: number,
  groupSizes: readonly number[],
): [number, number] | null {
  const size = groupSizes[group] ?? 0;
  if (key === "ArrowUp") return size === 0 ? null : [group, Math.max(0, index - 1)];
  if (key === "ArrowDown") return size === 0 ? null : [group, Math.min(size - 1, index + 1)];
  if (key === "Home") return size === 0 ? null : [group, 0];
  if (key === "End") return size === 0 ? null : [group, size - 1];
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const step = key === "ArrowLeft" ? -1 : 1;
  for (let next = group + step; next >= 0 && next < groupSizes.length; next += step) {
    const nextSize = groupSizes[next] ?? 0;
    if (nextSize > 0) return [next, Math.min(nextSize - 1, index)];
  }
  return null;
}
