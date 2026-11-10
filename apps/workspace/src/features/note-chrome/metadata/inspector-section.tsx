import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "@/shared/icons/static";
import { Collapse } from "@/shared/ui/collapse";
import { cn } from "@/shared/styling/class-names";
import type { InspectorSection as SectionId } from "./inspector-model";
import { inspectorTransition } from "./inspector-classes";

type Props = {
  section: SectionId;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  hidden?: boolean;
  keepMounted?: boolean;
  children: ReactNode;
};

export function inspectorHeadingId(section: SectionId): string {
  return `inspector-${section}-heading`;
}

export function InspectorSection({
  section,
  title,
  count,
  open,
  onToggle,
  action,
  hidden = false,
  keepMounted = false,
  children,
}: Props) {
  const [rendered, setRendered] = useState(open || keepMounted);
  if ((open || keepMounted) && !rendered) {
    setRendered(true);
  }
  const bodyId = `inspector-${section}-body`;

  return (
    <section
      data-inspector-section={section}
      aria-labelledby={inspectorHeadingId(section)}
      className={cn("border-t border-border/60", hidden && "hidden")}
    >
      <h2 className="sticky top-10 z-[2] m-0 flex h-9 items-center gap-1 bg-background px-2 text-[12.5px] font-medium">
        <button
          type="button"
          id={inspectorHeadingId(section)}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className={cn(
            "flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md bg-transparent px-2 text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            inspectorTransition,
          )}
        >
          <ChevronRightIcon
            size={12}
            className={cn(
              "shrink-0 text-muted-foreground/60 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          <span className="truncate">{title}</span>
          {count !== undefined && (
            <span className="font-normal tabular-nums text-muted-foreground/60">{count}</span>
          )}
        </button>
        {action}
      </h2>
      {rendered && (
        <Collapse open={open}>
          <div id={bodyId} className="px-4 pb-4 pt-0.5">
            {children}
          </div>
        </Collapse>
      )}
    </section>
  );
}
