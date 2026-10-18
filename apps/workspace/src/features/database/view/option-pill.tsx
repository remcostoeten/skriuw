import type { NotePropertyColor } from "@skriuw/renderer-core/contracts/workspace";
import { cn } from "@/shared/styling/class-names";

const DOT_CLASS: Readonly<Record<NotePropertyColor, string>> = {
  gray: "bg-project-gray",
  stone: "bg-muted-foreground",
  amber: "bg-project-amber",
  green: "bg-project-green",
  blue: "bg-project-blue",
  teal: "bg-project-teal",
  rose: "bg-project-pink",
  red: "bg-project-red",
};

type Props = {
  label: string;
  color: NotePropertyColor | null;
  className?: string;
};

export function OptionDot({ color }: { color: NotePropertyColor | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "database-option-dot size-2 shrink-0 rounded-full",
        color === null ? "border border-theme-dim" : DOT_CLASS[color],
      )}
    />
  );
}

export function OptionPill({ label, color, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-[5px] bg-[hsl(var(--foreground)/0.06)] px-1.5 text-[12px] leading-none text-foreground",
        className,
      )}
    >
      <OptionDot color={color} />
      <span className="truncate">{label}</span>
    </span>
  );
}
