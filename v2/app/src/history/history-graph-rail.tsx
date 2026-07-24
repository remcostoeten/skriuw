import { cn } from "../shared/lib/utils";

const TRUNK_X = 12;

type Props = {
  isFirst: boolean;
  isLast: boolean;
  isHead: boolean;
};

export function HistoryGraphRail({ isFirst, isLast, isHead }: Props) {
  return (
    <>
      {!isFirst && (
        <span
          aria-hidden
          className="absolute top-0 h-1/2 w-px -translate-x-1/2 bg-border/90"
          style={{ left: TRUNK_X }}
        />
      )}
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-0 h-1/2 w-px -translate-x-1/2 bg-border/90"
          style={{ left: TRUNK_X }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background transition-colors duration-150",
          isHead
            ? "h-2 w-2 bg-emerald-400 ring-emerald-400/25"
            : "h-1.5 w-1.5 bg-muted-foreground/38 group-hover:bg-foreground/58",
        )}
        style={{ left: TRUNK_X }}
      />
    </>
  );
}
