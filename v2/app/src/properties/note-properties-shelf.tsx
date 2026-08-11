import { useEffect, useId, useMemo, useState } from "react";
import { ChevronRightIcon } from "@/shared/icons";
import { cn } from "@/shared/lib/utils";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { NotePropertiesPanel } from "./note-properties-panel";

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

export function NotePropertiesShelf({ store, selectNoteId }: Props) {
  const selectPropertyCount = useMemo(
    () =>
      (state: RendererState): number => {
        const id = selectNoteId(state);
        if (id === null) return 0;
        return state.propertiesByNoteId.get(id)?.length ?? 0;
      },
    [selectNoteId],
  );
  const propertyCount = useRendererSelector(store, selectPropertyCount);
  const [open, setOpen] = useState(() => propertyCount > 0);
  const [bodyOverflowVisible, setBodyOverflowVisible] = useState(open);
  const bodyId = useId();

  useEffect(() => {
    if (!open) {
      setBodyOverflowVisible(false);
      return;
    }
    const id = setTimeout(() => setBodyOverflowVisible(true), 220);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <section aria-label="Note properties" className="group/shelf relative mb-4 w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="-ml-1 mb-0.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55 outline-none transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <ChevronRightIcon
          size={12}
          className={cn(
            "shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <span>Properties</span>
        {!open && propertyCount > 0 && (
          <span className="rounded-full border border-border/60 bg-card/70 px-1.5 text-[9px] tabular-nums text-muted-foreground">
            {propertyCount}
          </span>
        )}
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={cn("min-h-0", bodyOverflowVisible ? "overflow-visible" : "overflow-hidden")}>
          <NotePropertiesPanel store={store} selectNoteId={selectNoteId} />
        </div>
      </div>
    </section>
  );
}
