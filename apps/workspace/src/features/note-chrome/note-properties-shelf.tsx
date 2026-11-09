import { memo, useCallback, useEffect, useId, useState } from "react";
import { cn } from "@/shared/styling/class-names";
import { SectionChevron, SectionLabel } from "@/shared/ui/section-header";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { NotePropertiesPanel } from "./properties/panel";

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

type ShelfProps = {
  store: RendererStore;
  noteId: string | null;
};

export function NotePropertiesShelf({ store, selectNoteId }: Props) {
  const noteId = useRendererSelector(store, selectNoteId);
  return <PropertiesShelf store={store} noteId={noteId} />;
}

const PropertiesShelf = memo(function PropertiesShelf({ store, noteId }: ShelfProps) {
  const propertyCount = useRendererSelector(
    store,
    useCallback(
      (state: RendererState): number =>
        noteId === null ? 0 : (state.propertiesByNoteId.get(noteId)?.length ?? 0),
      [noteId],
    ),
  );
  const selectShelfNoteId = useCallback(() => noteId, [noteId]);
  const [open, setOpen] = useState(() => propertyCount > 0);
  const [bodyOverflowVisible, setBodyOverflowVisible] = useState(open);
  const [animated, setAnimated] = useState(false);
  const [openNoteId, setOpenNoteId] = useState(noteId);
  if (openNoteId !== noteId) {
    setOpenNoteId(noteId);
    setOpen(propertyCount > 0);
    setBodyOverflowVisible(propertyCount > 0);
    setAnimated(false);
  }
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
        onClick={() => {
          setAnimated(true);
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        aria-controls={bodyId}
        className="-ml-1 mb-0.5 inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-muted/50"
      >
        <SectionChevron open={open} />
        <SectionLabel title="Properties" count={propertyCount} />
      </button>
      <div
        id={bodyId}
        inert={!open}
        className={cn(
          "grid",
          animated &&
            "transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div
          className={cn("min-h-0", bodyOverflowVisible ? "overflow-visible" : "overflow-hidden")}
        >
          <NotePropertiesPanel store={store} selectNoteId={selectShelfNoteId} />
        </div>
      </div>
    </section>
  );
});
