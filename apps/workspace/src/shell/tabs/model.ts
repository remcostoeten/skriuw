import type { RendererState } from "@skriuw/renderer-core/store/types";

export type TabModel = {
  id: string;
  title: string;
  isActive: boolean;
  isAvailable: boolean;
  isPinned: boolean;
};

export const TAB_DRAG_MIME = "application/x-skriuw-tab";

export function tabModels(state: RendererState): TabModel[] {
  const primary = state.panes[0];
  if (!primary) {
    return [];
  }
  return primary.openNoteIds.map((id) => ({
    id,
    title: state.sourceNodes.get(id)?.title ?? "Untitled",
    isActive: primary.activeNoteId === id,
    isAvailable: state.metadata.has(id),
    isPinned: primary.pinnedNoteIds.includes(id),
  }));
}

export function sameTabModels(left: TabModel[], right: TabModel[]): boolean {
  return (
    left.length === right.length &&
    left.every((tab, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        tab.id === other.id &&
        tab.title === other.title &&
        tab.isActive === other.isActive &&
        tab.isAvailable === other.isAvailable &&
        tab.isPinned === other.isPinned
      );
    })
  );
}
