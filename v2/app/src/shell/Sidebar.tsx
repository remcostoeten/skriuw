import { memo } from "react";
import { useRendererSelector } from "../store/useRendererSelector";
import type { RendererStore } from "../store/types";

type Props = {
  store: RendererStore;
};

export function Sidebar({ store }: Props) {
  const visibleIds = useRendererSelector(store, (state) => state.visibleIds);
  return (
    <aside className="sidebar">
      <div className="sidebar-header">Skriuw</div>
      <ul className="sidebar-tree" role="tree" aria-label="Workspace">
        {visibleIds.map((id) => (
          <SidebarRow key={id} store={store} id={id} />
        ))}
      </ul>
    </aside>
  );
}

type RowProps = {
  store: RendererStore;
  id: string;
};

const SidebarRow = memo(function SidebarRow({ store, id }: RowProps) {
  const node = useRendererSelector(store, (state) => state.nodes.get(id));
  const isActive = useRendererSelector(store, (state) => state.activeNoteId === id);
  const isExpanded = useRendererSelector(store, (state) => state.expandedIds.has(id));
  if (!node) {
    return null;
  }
  const isFolder = node.kind === "folder";
  return (
    <li
      role="treeitem"
      aria-level={node.depth}
      aria-setsize={node.setSize}
      aria-posinset={node.posInSet}
      aria-selected={isActive}
      {...(isFolder ? { "aria-expanded": isExpanded } : {})}
    >
      <button
        type="button"
        className={`tree-row${isActive ? " is-active" : ""}`}
        style={{ paddingLeft: `${node.depth * 14}px` }}
        onClick={() => {
          if (isFolder) {
            store.toggleExpanded(id);
          } else {
            store.setActiveNote(id);
          }
        }}
      >
        <span className="tree-row-glyph">{isFolder ? (isExpanded ? "▾" : "▸") : "•"}</span>
        <span className="tree-row-title">{node.title}</span>
      </button>
    </li>
  );
});
