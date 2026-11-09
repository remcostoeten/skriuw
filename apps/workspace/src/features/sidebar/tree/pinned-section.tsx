import { memo, useMemo } from "react";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { FolderIcon, PinIcon } from "@/shared/icons/static";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { SectionLabel } from "../section-label";

type PinnedSectionProps = {
  store: RendererStore;
  ids: readonly string[];
  onSelect: (id: string) => void;
};

export function PinnedSection({ store, ids, onSelect }: PinnedSectionProps) {
  return (
    <section className="shrink-0" aria-label="Pinned">
      <SectionLabel label="Pinned" count={ids.length} />
      <div className="max-h-[148px] overflow-y-auto px-1.5 pb-1" role="list">
        {ids.map((id) => (
          <PinnedRow key={id} store={store} id={id} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

type PinnedRowProps = {
  store: RendererStore;
  id: string;
  onSelect: (id: string) => void;
};

const PinnedRow = memo(function PinnedRow({ store, id, onSelect }: PinnedRowProps) {
  const selectNode = useMemo(() => (state: RendererState) => state.nodes.get(id), [id]);
  const selectActive = useMemo(() => (state: RendererState) => state.activeNoteId === id, [id]);
  const node = useRendererSelector(store, selectNode);
  const isActive = useRendererSelector(store, selectActive);
  if (!node) {
    return null;
  }
  const Icon = node.kind === "folder" ? FolderIcon : PinIcon;
  return (
    <button
      type="button"
      role="listitem"
      data-row-key={id}
      title={node.title}
      onClick={() => onSelect(id)}
      className={`flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[12.5px] font-medium outline-none transition-colors duration-100 focus-visible:bg-foreground/[0.16] focus-visible:text-foreground active:scale-[0.985] pointer-coarse:h-11 ${
        isActive
          ? "bg-muted text-foreground"
          : "text-foreground/65 hover:bg-muted hover:text-foreground/90"
      }`}
    >
      <Icon size={13} className="shrink-0 text-theme-dim" />
      <span className="min-w-0 select-none truncate">{node.title}</span>
    </button>
  );
});
