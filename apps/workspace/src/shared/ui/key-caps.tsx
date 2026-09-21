import { cn } from "@/shared/lib/utils";

type Props = {
  keys: readonly string[];
  className?: string;
};

/** Renders each key of a shortcut as its own key cap. */
export function KeyCaps({ keys, className }: Props) {
  return (
    <span className={cn("flex shrink-0 items-center gap-[3px]", className)}>
      {keys.map((token, index) => (
        <kbd
          key={`${token}-${index}`}
          className="flex h-4 min-w-4 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] leading-none text-muted-foreground"
        >
          {token}
        </kbd>
      ))}
    </span>
  );
}
