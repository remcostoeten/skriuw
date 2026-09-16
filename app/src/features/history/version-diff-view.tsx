import { useMemo, useState } from "react";
import { CheckIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import { diffMarkdown, type DiffHunk, type DiffLine, type MarkdownDiff } from "./diff-model";
import { splitRows, type DiffLayout, type SplitRow } from "./split-diff-model";

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

export function VersionDiffView({ versionMarkdown, currentMarkdown, layout = "unified" }: Props) {
  const diff = useMarkdownDiff(versionMarkdown, currentMarkdown);
  const [expandedHunks, setExpandedHunks] = useState<ReadonlySet<string>>(() => new Set());

  if (diff.hunks.length === 0) {
    return (
      <div className="m-auto flex max-w-[38ch] flex-col items-center px-6 text-center">
        <span className="mb-3 grid size-9 place-items-center rounded-full bg-success-soft text-success">
          <CheckIcon size={16} />
        </span>
        <p className="m-0 text-[12px] font-[600] text-foreground">Identical to the note now</p>
        <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
          Nothing has changed since this revision was captured.
        </p>
      </div>
    );
  }

  function expand(key: string): void {
    setExpandedHunks((previous) => new Set(previous).add(key));
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-3">
      <div className={cn("diff-view", layout === "split" && "diff-split")}>
        {diff.truncated && (
          <p className="mx-4 mb-3 rounded-[var(--radius-md)] bg-theme-hover px-3 py-2 font-sans text-[11px] leading-[1.5] text-muted-foreground">
            This revision is too large to align line by line, so every line is shown as replaced.
          </p>
        )}
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
            <HunkLines lines={hunk.lines} layout={layout} />
          </div>
        ))}
      </div>
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
