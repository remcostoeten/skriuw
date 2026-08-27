import { cn } from "@/shared/lib/utils";

type Props = {
  wordDelta: number | null;
};

/**
 * How much a note grew or shrank in this revision, in words. Renders nothing
 * when the delta is unknown — the oldest revision has nothing to compare
 * against, and revisions captured before word counts were recorded carry none.
 */
export function VersionStats({ wordDelta }: Props) {
  if (wordDelta === null) {
    return null;
  }

  const magnitude = Math.abs(wordDelta);
  const label = magnitude === 1 ? "word" : "words";

  return (
    <span
      className={cn(
        "ml-auto shrink-0 font-mono text-[10px] tabular-nums",
        wordDelta > 0 && "diff-stat-added",
        wordDelta < 0 && "diff-stat-removed",
        wordDelta === 0 && "text-muted-foreground/45",
      )}
      title={
        wordDelta === 0
          ? "No change in length in this revision"
          : `${magnitude} ${label} ${wordDelta > 0 ? "added" : "removed"} in this revision`
      }
    >
      {wordDelta > 0 ? `+${wordDelta}` : wordDelta < 0 ? `−${magnitude}` : "0"}
    </span>
  );
}
