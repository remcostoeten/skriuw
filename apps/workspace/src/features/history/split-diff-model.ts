import type { DiffHunk, DiffLine } from "./diff-model";

export type DiffLayout = "unified" | "split";

export const DIFF_LAYOUTS: readonly DiffLayout[] = ["unified", "split"];

export type SplitRow = {
  key: string;
  before: DiffLine | null;
  after: DiffLine | null;
};

export function isDiffLayout(value: unknown): value is DiffLayout {
  return typeof value === "string" && (DIFF_LAYOUTS as readonly string[]).includes(value);
}

/**
 * Lays a hunk's lines out in two columns. Context lines occupy both sides;
 * within a run of changed lines the removed lines are paired in order with
 * the added lines, so an edited line sits beside its replacement and the
 * surplus on either side faces an empty cell.
 */
export function splitRows(lines: readonly DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];

  function flush(): void {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index += 1) {
      const before = removed[index] ?? null;
      const after = added[index] ?? null;
      rows.push({ key: `${before?.key ?? "-"}|${after?.key ?? "-"}`, before, after });
    }
    removed = [];
    added = [];
  }

  for (const line of lines) {
    if (line.kind === "context") {
      flush();
      rows.push({ key: line.key, before: line, after: line });
    } else if (line.kind === "removed") {
      removed.push(line);
    } else {
      added.push(line);
    }
  }
  flush();
  return rows;
}

export function splitHunkRows(hunk: DiffHunk): {
  hidden: SplitRow[];
  rows: SplitRow[];
} {
  return { hidden: splitRows(hunk.hiddenBefore), rows: splitRows(hunk.lines) };
}
