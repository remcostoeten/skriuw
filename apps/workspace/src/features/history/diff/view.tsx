import { useMemo, useState } from "react";
import { CheckIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { diffMarkdown, type DiffHunk, type DiffLine, type MarkdownDiff } from "./model";
import { splitRows, type DiffLayout, type SplitRow } from "./split-model";

type Props = {
  versionMarkdown: string;
  currentMarkdown: string;
  layout?: DiffLayout;
};

export function useMarkdownDiff(versionMarkdown: string, currentMarkdown: string): MarkdownDiff {
  return useMemo(
    () => diffMarkdown(versionMarkdown, currentMarkdown),
    [versionMarkdown, currentMarkdown],
  );
}

function countChangeBlocks(hunks: readonly DiffHunk[]): number {
  let blocks = 0;
  for (const hunk of hunks) {
    let inChange = false;
    for (const line of hunk.lines) {
      const changed = line.kind !== "context";
      if (changed && !inChange) {
        blocks += 1;
      }
      inChange = changed;
    }
  }
  return blocks;
}

export function VersionDiffView({ versionMarkdown, currentMarkdown, layout = "unified" }: Props) {
  const diff = useMarkdownDiff(versionMarkdown, currentMarkdown);
  if (diff.hunks.length === 0) {
    return (
      <div className="m-auto flex max-w-[38ch] flex-col items-center gap-1.5 px-6 pb-24 text-center">
        <span className="mb-1.5 grid size-8 place-items-center rounded-full bg-theme-hover text-foreground">
          <CheckIcon size={15} />
        </span>
        <p className="m-0 text-[13px] font-medium text-foreground">Same as the note now</p>
        <p className="m-0 text-xs leading-[1.5] text-theme-secondary">
          Nothing has changed since this revision was captured.
        </p>
      </div>
    );
  }

  const changes = countChangeBlocks(diff.hunks);
  return (
    <div className="history-reading min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
      <div className="mx-auto w-full max-w-[920px] px-8 pt-5 pb-32 max-[860px]:px-4">
        <p className="m-0 mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-theme-secondary">
          <span>
            {changes} {changes === 1 ? "change" : "changes"} from this revision to the note now
          </span>
          <span className="flex items-baseline gap-3 text-theme-dim">
            <span>
              <span className="diff-stat-removed">−</span> only in this revision
            </span>
            <span>
              <span className="diff-stat-added">+</span> only in the note now
            </span>
          </span>
        </p>
        {diff.truncated && (
          <p className="m-0 mb-3 rounded-lg border border-theme-divider px-3 py-2 text-xs leading-[1.5] text-theme-secondary">
            This revision is too large to align line by line, so every line is shown as replaced.
          </p>
        )}
        <MarkdownDiffHunks diff={diff} layout={layout} />
      </div>
    </div>
  );
}

type MarkdownDiffHunksProps = {
  diff: MarkdownDiff;
  layout?: DiffLayout;
};

export function MarkdownDiffHunks({ diff, layout = "unified" }: MarkdownDiffHunksProps) {
  const [expandedHunks, setExpandedHunks] = useState<ReadonlySet<string>>(() => new Set());

  function expand(key: string): void {
    setExpandedHunks((previous) => new Set(previous).add(key));
  }

  return (
    <div className={cn("diff-view", layout === "split" && "diff-split")}>
      {diff.hunks.map((hunk) => (
        <div key={hunk.key} className="diff-hunk">
          {hunk.hiddenBefore.length > 0 &&
            (expandedHunks.has(hunk.key) ? (
              <HunkLines lines={hunk.hiddenBefore} layout={layout} />
            ) : (
              <button type="button" className="diff-skip" onClick={() => expand(hunk.key)}>
                Show {hunk.hiddenBefore.length} unchanged{" "}
                {hunk.hiddenBefore.length === 1 ? "line" : "lines"}
              </button>
            ))}
          <div className="diff-hunk-body">
            <HunkLines lines={hunk.lines} layout={layout} />
          </div>
        </div>
      ))}
    </div>
  );
}

type HunkLinesProps = {
  lines: DiffHunk["lines"];
  layout: DiffLayout;
};

function HunkLines({ lines, layout }: HunkLinesProps) {
  const rows = useMemo(() => (layout === "split" ? splitRows(lines) : null), [lines, layout]);
  if (rows !== null) {
    return rows.map((row) => <SplitDiffRow key={row.key} row={row} />);
  }
  return lines.map((line) => <DiffRow key={line.key} line={line} />);
}

type LineTextProps = {
  line: DiffLine;
};

function LineText({ line }: LineTextProps) {
  return (
    <span className="diff-row-text">
      {line.segments.map((segment, index) =>
        segment.changed ? (
          <mark key={index} className="diff-word">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

type DiffRowProps = {
  line: DiffLine;
};

function DiffRow({ line }: DiffRowProps) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : "";
  return (
    <div className={cn("diff-row", `diff-row-${line.kind}`)}>
      <span aria-hidden className="diff-row-number">
        {line.beforeLine ?? ""}
      </span>
      <span aria-hidden className="diff-row-number">
        {line.afterLine ?? ""}
      </span>
      <span aria-hidden className="diff-row-sign">
        {sign}
      </span>
      <LineText line={line} />
    </div>
  );
}

type SplitDiffRowProps = {
  row: SplitRow;
};

function SplitDiffRow({ row }: SplitDiffRowProps) {
  return (
    <div className="diff-split-row">
      <SplitCell line={row.before} side="before" />
      <SplitCell line={row.after} side="after" />
    </div>
  );
}

type SplitCellProps = {
  line: DiffLine | null;
  side: "before" | "after";
};

function SplitCell({ line, side }: SplitCellProps) {
  if (line === null) {
    return <span aria-hidden className="diff-split-cell diff-split-cell-empty" />;
  }
  const number = side === "before" ? line.beforeLine : line.afterLine;
  return (
    <span className={cn("diff-split-cell", `diff-split-cell-${line.kind}`)}>
      <span aria-hidden className="diff-row-number">
        {number ?? ""}
      </span>
      <LineText line={line} />
    </span>
  );
}
