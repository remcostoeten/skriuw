import { memo, useMemo } from "react";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { FolderIcon, PinIcon } from "@/shared/icons/static";
import type { RendererState, RendererStore } from "@/store/types";

type PinnedChipsProps = {
  store: RendererStore;
  ids: readonly string[];
  onSelect: (id: string) => void;
};

export function PinnedChips({ store, ids, onSelect }: PinnedChipsProps) {
  return (
    <div
      className="flex shrink-0 flex-wrap gap-1 border-b border-sidebar-border/50 px-1.5 pb-2"
      role="list"
      aria-label="Pinned"
    >
      {ids.map((id) => (
        <PinnedChip key={id} store={store} id={id} onSelect={onSelect} />
      ))}
    </div>
  );
}

type PinnedChipProps = {
  store: RendererStore;
  id: string;
  onSelect: (id: string) => void;
};

const PinnedChip = memo(function PinnedChip({ store, id, onSelect }: PinnedChipProps) {
  const selectNode = useMemo(() => (state: RendererState) => state.nodes.get(id), [id]);
  const selectActive = useMemo(
    () => (state: RendererState) => state.activeNoteId === id,
    [id],
  );
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
      className={`flex h-6 max-w-[10rem] min-w-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium active:scale-[0.97] ${
        isActive
          ? "border-foreground/[0.16] bg-muted text-foreground"
          : "border-sidebar-border/60 bg-foreground/[0.03] text-foreground/65 hover:bg-muted hover:text-foreground/90"
      }`}
    >
      <Icon size={11} className="shrink-0 text-muted-foreground/70" />
      <span className="min-w-0 select-none truncate">{node.title}</span>
    </button>
  );
});
