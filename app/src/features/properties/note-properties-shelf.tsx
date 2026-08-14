import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { SectionChevron, SectionLabel } from "@/shared/ui/section-header";
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
        className="-ml-1 mb-0.5 inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring/50"
      >
        <SectionChevron open={open} />
        <SectionLabel title="Properties" count={propertyCount} />
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
