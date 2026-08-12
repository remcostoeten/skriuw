import { cn } from "@/shared/lib/utils";

const TRUNK_X = 15;

type Props = {
  isFirst: boolean;
  isLast: boolean;
  isHead: boolean;
  isSelected: boolean;
};

export function HistoryGraphRail({ isFirst, isLast, isHead, isSelected }: Props) {
  return (
    <>
      {!isFirst && (
        <span
          aria-hidden
          className="absolute top-0 h-1/2 w-px -translate-x-1/2 bg-theme-divider"
          style={{ left: TRUNK_X }}
        />
      )}
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-0 h-1/2 w-px -translate-x-1/2 bg-theme-divider"
          style={{ left: TRUNK_X }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40 ring-[3px] ring-theme-editor transition-all duration-150 group-hover:bg-muted-foreground/70",
          isHead && "size-2 bg-success group-hover:bg-success",
          isSelected && "size-2 bg-foreground ring-theme-editor group-hover:bg-foreground",
          isSelected && isHead && "bg-success group-hover:bg-success",
        )}
        style={{ left: TRUNK_X }}
      />
      {isSelected && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 transition-opacity",
            isHead ? "ring-success/35" : "ring-foreground/20",
          )}
          style={{ left: TRUNK_X }}
        />
      )}
    </>
  );
}
