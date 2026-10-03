import { useRef } from "react";
import { useMediaQuery } from "@/shared/viewport/use-media-query";
import { SidebarCalendar } from "@/features/journal/calendar";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { pinnedNodeIds } from "@skriuw/renderer-core/store/tree";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { TreeContextMenu } from "./context-menu/tree-menu";
import { MoveBanner } from "./drag/move-banner";
import { useMoveMode } from "./drag/move-mode";
import { HeaderActions } from "./header/actions";
import { SearchField } from "./search/field";
import { SidebarSearchResults } from "./search/results";
import { SavedSearchList } from "./search/saved-searches";
import { useSidebarSearch } from "./search/state";
import { focusTreeItem } from "./tree/focus";
import { handleTreeKeyDown } from "./tree/keyboard";
import { TreeList } from "./tree/list";
import { useTreeMetrics } from "./tree/metrics";
import { activateNote, revealNode, trashSelectedNodes } from "./tree/operations";
import { PinnedChips } from "./tree/pinned-chips";
import { useTreePointer } from "./tree/pointer";
import { useTreeViewport } from "./tree/viewport";

type Props = {
  store: RendererStore;
  onOpenCommandPalette: () => void;
};

function selectVisibleIds(state: RendererState) {
  return state.visibleIds;
}

function selectPinnedIds(state: RendererState) {
  return pinnedNodeIds([...state.sourceNodes.values()]);
}

function sameIdList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function selectCompactSidebar(state: RendererState) {
  return state.settings.compactSidebar === true;
}

function selectShowTreeGuides(state: RendererState) {
  return state.settings["showTreeGuides"] === true;
}

export function Sidebar({ store, onOpenCommandPalette }: Props) {
  const visibleIds = useRendererSelector(store, selectVisibleIds);
  const pinnedIds = useRendererSelector(store, selectPinnedIds, sameIdList);
  const compactSidebar = useRendererSelector(store, selectCompactSidebar);
  const showTreeGuides = useRendererSelector(store, selectShowTreeGuides);
  const asideRef = useRef<HTMLElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const touchRows = useMediaQuery("(pointer: coarse)");
  const metrics = useTreeMetrics(asideRef);
  const effectiveCompact = compactSidebar || metrics.isNarrow;
  const rowHeight = touchRows ? 44 : effectiveCompact ? 28 : 34;
  const search = useSidebarSearch(store, treeRef);
  const viewport = useTreeViewport(store, treeRef, rowHeight, visibleIds.length, search.isOpen);
  const moveMode = useMoveMode(store, visibleIds);
  const pointer = useTreePointer(store, treeRef, viewport.rowPitch, (id) =>
    trashSelectedNodes(store, id),
  );

  function onPinnedSelect(id: string): void {
    const node = store.getState().nodes.get(id);
    if (!node) {
      return;
    }
    revealNode(store, id);
    if (node.kind === "folder") {
      if (!store.getState().expandedIds.has(id)) {
        store.toggleExpanded(id);
      }
    } else {
      activateNote(store, id);
    }
    focusTreeItem(treeRef, id);
  }

  return (
    <aside
      ref={asideRef}
      className={`flex h-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground${effectiveCompact ? " sidebar-compact" : ""}${touchRows ? " sidebar-touch" : ""}${showTreeGuides ? " sidebar-guides" : ""}`}
    >
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div
          className={`relative flex h-11 items-center justify-between overflow-hidden ${metrics.isNarrow ? "px-1.5" : "px-3"}`}
        >
          <HeaderActions
            store={store}
            isNarrow={metrics.isNarrow}
            isSearchOpen={search.isOpen}
            searchTriggerRef={search.triggerRef}
            onOpenSearch={search.open}
            onOpenCommandPalette={onOpenCommandPalette}
          />
          <SearchField search={search} />
        </div>
      </div>
      <div ref={search.savedSearchesRef} onBlur={search.onAreaBlur} className="shrink-0">
        <SavedSearchList
          store={store}
          query={search.trimmedQuery}
          onSelect={search.selectSavedSearch}
        />
      </div>
      {search.trimmedQuery ? (
        <SidebarSearchResults
          ref={search.resultsRef}
          store={store}
          query={search.trimmedQuery}
          onKeyDown={search.onResultsKeyDown}
          onBlur={search.onAreaBlur}
          onFolderSelect={search.onFolderSelect}
          onNoteSelect={search.onNoteSelect}
        />
      ) : (
        <>
          {moveMode.ids !== null && <MoveBanner store={store} ids={moveMode.ids} />}
          <TreeContextMenu
            store={store}
            asideRef={asideRef}
            touch={pointer.touch}
            onMove={moveMode.start}
          >
            {pinnedIds.length > 0 && (
              <PinnedChips store={store} ids={pinnedIds} onSelect={onPinnedSelect} />
            )}
            <TreeList
              store={store}
              treeRef={treeRef}
              visibleIds={visibleIds}
              metrics={metrics}
              rowPitch={viewport.rowPitch}
              treeWindow={viewport.treeWindow}
              touchRows={touchRows}
              movingSet={moveMode.movingSet}
              dropTarget={pointer.dropTarget}
              pointer={pointer.handlers}
              onKeyDown={(event) =>
                handleTreeKeyDown(event, {
                  store,
                  treeRef,
                  moveMode,
                  openSearch: search.openAndFocus,
                })
              }
              onScroll={viewport.onScroll}
            />
            <SidebarCalendar store={store} />
          </TreeContextMenu>
        </>
      )}
    </aside>
  );
}
