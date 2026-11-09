import { memo, useRef } from "react";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useShortcutHints } from "@/commands/hints";
import { FolderPlusIcon, FoldVerticalIcon, UnfoldVerticalIcon } from "@/shared/icons/static";
import { useMediaQuery } from "@/shared/viewport/use-media-query";
import { SidebarCalendar } from "@/features/journal/calendar";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { TreeContextMenu } from "./context-menu/tree-menu";
import { selectPinnedIds } from "./pinned-ids";
import { MoveBanner } from "./drag/move-banner";
import { useMoveMode } from "./drag/move-mode";
import { SidebarHeader } from "./header/actions";
import { SectionLabel, sectionActionClass } from "./section-label";
import { SearchField } from "./search/field";
import { SidebarSearchResults } from "./search/results";
import { SavedSearchList } from "./search/saved-searches";
import { useSidebarSearch } from "./search/state";
import { focusTreeItem } from "./tree/focus";
import { handleTreeKeyDown } from "./tree/keyboard";
import { TreeList } from "./tree/list";
import { useTreeMetrics } from "./tree/metrics";
import {
  activateNote,
  createFolder,
  revealNode,
  toggleAllFolders,
  trashSelectedNodes,
} from "./tree/operations";
import { PinnedSection } from "./tree/pinned-section";
import { useTreePointer } from "./tree/pointer";
import { treeRowPitch } from "./tree/viewport";

type Props = {
  store: RendererStore;
  onOpenCommandPalette: () => void;
};

function selectVisibleIds(state: RendererState) {
  return state.visibleIds;
}

function sameIdList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((id, index) => id === right[index]))
  );
}

function selectCompactSidebar(state: RendererState) {
  return state.settings.compactSidebar === true;
}

function selectShowTreeGuides(state: RendererState) {
  return state.settings["showTreeGuides"] === true;
}

function selectAnyExpanded(state: RendererState) {
  return state.expandedIds.size > 0;
}

const TREE_SECTION_SHORTCUT_IDS = ["createFolder", "collapseAllFolders"] as const;

type TreeSectionLabelProps = {
  store: RendererStore;
};

function TreeSectionLabel({ store }: TreeSectionLabelProps) {
  const anyExpanded = useRendererSelector(store, selectAnyExpanded);
  const hints = useShortcutHints(store, TREE_SECTION_SHORTCUT_IDS);
  return (
    <SectionLabel
      label="All notes"
      actions={
        <>
          <Tooltip label="New folder" side="bottom" shortcut={hints.createFolder}>
            <button
              type="button"
              className={sectionActionClass}
              aria-label="New folder"
              onClick={() => createFolder(store, null)}
            >
              <FolderPlusIcon size={14} />
            </button>
          </Tooltip>
          <Tooltip
            label={anyExpanded ? "Collapse all folders" : "Expand all folders"}
            side="bottom"
            shortcut={anyExpanded ? hints.collapseAllFolders : undefined}
          >
            <button
              type="button"
              className={sectionActionClass}
              aria-label="Toggle all folders"
              onClick={() => toggleAllFolders(store)}
            >
              {anyExpanded ? <FoldVerticalIcon size={14} /> : <UnfoldVerticalIcon size={14} />}
            </button>
          </Tooltip>
        </>
      }
    />
  );
}

export const Sidebar = memo(function Sidebar({ store, onOpenCommandPalette }: Props) {
  const visibleIds = useRendererSelector(store, selectVisibleIds, sameIdList);
  const pinnedIds = useRendererSelector(store, selectPinnedIds, sameIdList);
  const compactSidebar = useRendererSelector(store, selectCompactSidebar);
  const showTreeGuides = useRendererSelector(store, selectShowTreeGuides);
  const asideRef = useRef<HTMLElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const touchRows = useMediaQuery("(pointer: coarse)");
  const metrics = useTreeMetrics(asideRef);
  const effectiveCompact = compactSidebar || metrics.isNarrow;
  const rowHeight = touchRows ? 44 : effectiveCompact ? 24 : 28;
  const search = useSidebarSearch(store, treeRef);
  const moveMode = useMoveMode(store, visibleIds);
  const pointer = useTreePointer(store, treeRef, treeRowPitch(rowHeight), (id) =>
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
      <SidebarHeader
        store={store}
        isNarrow={metrics.isNarrow}
        onOpenCommandPalette={onOpenCommandPalette}
      />
      <SearchField search={search} />
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
              <PinnedSection store={store} ids={pinnedIds} onSelect={onPinnedSelect} />
            )}
            <TreeSectionLabel store={store} />
            <TreeList
              store={store}
              treeRef={treeRef}
              visibleIds={visibleIds}
              metrics={metrics}
              rowHeight={rowHeight}
              isSearchActive={search.trimmedQuery !== ""}
              touchRows={touchRows}
              movingSet={moveMode.movingSet}
              dropTarget={pointer.dropTarget}
              pointer={pointer.handlers}
              onKeyDown={(event) =>
                handleTreeKeyDown(event, {
                  store,
                  treeRef,
                  moveMode,
                  openSearch: search.focus,
                })
              }
            />
            <SidebarCalendar store={store} />
          </TreeContextMenu>
        </>
      )}
    </aside>
  );
});
