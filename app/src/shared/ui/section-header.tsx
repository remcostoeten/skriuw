import { ChevronRightIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";

/**
 * The single type scale for every small uppercase label that names a group of
 * content — panel section headers, menu group labels, list group headers, and
 * labels sitting above a value. Compose it with the container's own spacing
 * rather than restating the size, weight, tracking, or colour.
 */
export const sectionLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70";

/**
 * The clickable row of a collapsible section header. Pair it with
 * `SectionChevron` and `SectionLabel`; add `sticky top-0 z-[1] bg-background`
 * at the call site when the header pins to a scrolling container.
 */
export const sectionHeaderClass =
  "flex h-6 w-full cursor-pointer items-center gap-1.5 px-4 text-left";

type SectionLabelProps = {
  title: string;
  count?: number;
};

/**
 * The label half of a section header: title plus an optional `(n)` badge.
 * Deliberately quieter than `sectionLabelClass` — collapsible headers sit a
 * step below their content in size and ink so they read as structure, not
 * as another content row.
 */
export function SectionLabel({ title, count }: SectionLabelProps) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-muted-foreground/60">
      <span className="truncate">{title}</span>
      {count !== undefined && (
        <span className="font-normal tabular-nums text-muted-foreground/40">({count})</span>
      )}
    </span>
  );
}

type SectionChevronProps = {
  open: boolean;
  size?: number;
};

/**
 * The leading disclosure chevron for a collapsible section: points right when
 * closed, rotates down when open.
 */
export function SectionChevron({ open, size = 10 }: SectionChevronProps) {
  return (
    <ChevronRightIcon
      size={size}
      className={cn(
        "shrink-0 text-muted-foreground/50 transition-transform duration-150 motion-reduce:transition-none",
        open && "rotate-90",
      )}
    />
  );
}
