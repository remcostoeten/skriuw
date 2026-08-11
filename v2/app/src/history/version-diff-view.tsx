import { useMemo } from "react";
import { CheckIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { diffMarkdown, type DiffLine, type MarkdownDiff } from "./diff-model";

type Props = {
  versionMarkdown: string;
  currentMarkdown: string;
};

export function useMarkdownDiff(versionMarkdown: string, currentMarkdown: string): MarkdownDiff {
  return useMemo(
    () => diffMarkdown(versionMarkdown, currentMarkdown),
    [versionMarkdown, currentMarkdown],
  );
}

export function VersionDiffView({ versionMarkdown, currentMarkdown }: Props) {
  const diff = useMarkdownDiff(versionMarkdown, currentMarkdown);

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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-3">
      <div className="diff-view">
        {diff.truncated && (
          <p className="mx-4 mb-3 rounded-[var(--radius-md)] bg-theme-hover px-3 py-2 font-sans text-[11px] leading-[1.5] text-muted-foreground">
            This revision is too large to align line by line, so every line is shown as replaced.
          </p>
        )}
        {diff.hunks.map((hunk) => (
          <div key={hunk.key} className="diff-hunk">
            {hunk.skippedBefore > 0 && (
              <p className="diff-skip m-0">
                {hunk.skippedBefore} unchanged {hunk.skippedBefore === 1 ? "line" : "lines"}
              </p>
            )}
            {hunk.lines.map((line) => (
              <DiffRow key={line.key} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
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
    </div>
  );
}
