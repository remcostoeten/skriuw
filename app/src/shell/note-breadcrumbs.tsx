import { ChevronRightIcon } from "@/shared/icons/static";
import type { RendererState, RendererStore } from "@/store/types";
import { useRendererSelector } from "@/store/use-renderer-selector";

type Props = {
  store: RendererStore;
};

type Crumb = {
  id: string;
  title: string;
};

const MAX_ANCESTORS = 3;

function selectCrumbs(state: RendererState): readonly Crumb[] {
  const noteId = state.activeNoteId;
  if (noteId === null) {
    return [];
  }
  const note = state.nodes.get(noteId);
  const title = state.metadata.get(noteId)?.title ?? note?.title ?? "";
  if (title === "") {
    return [];
  }
  const ancestors: Crumb[] = [];
  let parentId = note?.parentId ?? null;
  while (parentId !== null) {
    const parent = state.nodes.get(parentId);
    if (parent === undefined) {
      break;
    }
    ancestors.unshift({ id: parent.id, title: parent.title });
    parentId = parent.parentId;
  }
  return [...ancestors, { id: noteId, title }];
}

function sameCrumbs(left: readonly Crumb[], right: readonly Crumb[]): boolean {
  return (
    left.length === right.length &&
    left.every((crumb, index) => {
      const other = right[index];
      return other !== undefined && crumb.id === other.id && crumb.title === other.title;
    })
  );
}

function selectExpandedIds(state: RendererState): ReadonlySet<string> {
  return state.expandedIds;
}

export function NoteBreadcrumbs({ store }: Props) {
  const crumbs = useRendererSelector(store, selectCrumbs, sameCrumbs);
  const expandedIds = useRendererSelector(store, selectExpandedIds);

  if (crumbs.length === 0) {
    return null;
  }

  function revealFolder(id: string): void {
    if (!expandedIds.has(id)) {
      store.toggleExpanded(id);
    }
    store.setFocusedNode(id);
    store.selectTreeNode(id, "replace");
  }

  const ancestors = crumbs.slice(0, -1);
  const note = crumbs[crumbs.length - 1] as Crumb;
  const visibleAncestors =
    ancestors.length > MAX_ANCESTORS ? ancestors.slice(ancestors.length - MAX_ANCESTORS) : ancestors;
  const hiddenCount = ancestors.length - visibleAncestors.length;

  return (
    <nav
      aria-label="Note location"
      className="flex min-w-0 items-center gap-0.5 text-sm text-sidebar-foreground/70"
      title={crumbs.map((crumb) => crumb.title).join(" / ")}
    >
      {hiddenCount > 0 && (
        <>
          <span className="shrink-0 px-1">…</span>
          <ChevronRightIcon size={12} className="shrink-0 opacity-50" />
        </>
      )}
      {visibleAncestors.map((crumb) => (
        <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            className="max-w-[10rem] truncate rounded px-1 py-0.5 transition-colors duration-150 hover:bg-muted hover:text-foreground"
            onClick={() => revealFolder(crumb.id)}
          >
            {crumb.title}
          </button>
          <ChevronRightIcon size={12} className="shrink-0 opacity-50" />
        </span>
      ))}
      <span className="min-w-0 truncate px-1 text-sidebar-foreground">{note.title}</span>
    </nav>
  );
}
