import type { ReactNode } from "react";

type Props = {
  label: string;
  count?: number;
  actions?: ReactNode;
};

export function SectionLabel({ label, count, actions }: Props) {
  return (
    <div className="group/section flex h-7 shrink-0 items-center gap-1.5 pr-1.5 pl-3.5 text-[11px] font-medium text-theme-dim select-none">
      <span>{label}</span>
      {count !== undefined && <span className="text-[10.5px] tabular-nums">{count}</span>}
      {actions && (
        <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/section:opacity-100 group-focus-within/section:opacity-100 pointer-coarse:opacity-100">
          {actions}
        </span>
      )}
    </div>
  );
}

export const sectionActionClass =
  "inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-theme-dim transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:bg-sidebar-accent/60 focus-visible:text-foreground focus-visible:shadow-none focus-visible:outline-none pointer-coarse:h-9 pointer-coarse:w-9";
