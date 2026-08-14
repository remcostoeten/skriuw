import { useCallback, useRef, useState } from "react";
import {
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeSplit,
  closeTab,
  closeTabsToSide,
  focusPane,
  reorderTab,
  resetSplitRatio,
  setSplitRatio,
  togglePinTab,
  toggleSplitOrientation,
} from "@/store/actions/panes";
import {
  CloseIcon,
  PinIcon,
  PinOffIcon,
  SplitViewIcon,
  SplitViewStackedIcon,
} from "@/shared/icons/static";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { PRIMARY_PANE_ID, SECONDARY_PANE_ID } from "@/store/panes";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import { EditorHost } from "./editor-host";
import { SplitDivider } from "./split-divider";
import { splitGridTemplate, splitTrackProperty } from "./split-layout";

type Props = {
  store: RendererStore;
};

type TabModel = {
  id: string;
  title: string;
  isActive: boolean;
  isAvailable: boolean;
  isPinned: boolean;
};

function selectPanes(state: RendererState) {
  return state.panes;
}

function selectSplitOrientation(state: RendererState) {
  return state.splitOrientation;
}

function selectSplitRatio(state: RendererState) {
  return state.splitRatio;
}

function selectSecondaryNoteId(state: RendererState): string | null {
  const pane = state.panes[1];
  const noteId = pane?.activeNoteId ?? null;
  return noteId !== null && state.metadata.has(noteId) ? noteId : null;
}

function tabModels(state: RendererState): TabModel[] {
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

function sameTabModels(left: TabModel[], right: TabModel[]): boolean {
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

type ContextTarget = { kind: "tab"; id: string } | { kind: "strip" };

type DragState = { id: string; before: string | null };

const TAB_DRAG_MIME = "application/x-skriuw-tab";

export function EditorPanes({ store }: Props) {
  const panes = useRendererSelector(store, selectPanes);
  const tabs = useRendererSelector(store, tabModels, sameTabModels);
  const orientation = useRendererSelector(store, selectSplitOrientation);
  const ratio = useRendererSelector(store, selectSplitRatio);
  const hasSplit = panes.length > 1;
  const splitRef = useRef<HTMLDivElement>(null);
  const trackProperty = splitTrackProperty(orientation);
  const showStrip = tabs.length > 1 || hasSplit;
  // A single shared context menu serves every tab; right-clicking the strip
  // resolves the tab under the cursor via `data-tab-id` instead of mounting a
  // Radix ContextMenu per tab.
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /**
   * Divider drags repaint through a direct write to the split container's track
   * list. The property is non-inherited and owned by this one element, so the
   * editors below it neither restyle nor re-render until the pointer is released.
   */
  const previewSplit = useCallback(
    (next: number) => {
      const container = splitRef.current;
      if (container) {
        container.style[trackProperty] = splitGridTemplate(next);
      }
    },
    [trackProperty],
  );
  const commitSplit = useCallback((next: number) => setSplitRatio(store, next), [store]);
  const resetSplit = useCallback(() => resetSplitRatio(store), [store]);

  function onStripContextMenu(event: React.MouseEvent) {
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
    const id = tabEl?.getAttribute("data-tab-id") ?? null;
    setContextTarget(id === null ? { kind: "strip" } : { kind: "tab", id });
  }

  function onTabDragOver(event: React.DragEvent, tab: TabModel, index: number) {
    if (drag === null || tab.isPinned) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX >= rect.left + rect.width / 2;
    const before = after ? (tabs[index + 1]?.id ?? null) : tab.id;
    if (before !== drag.before) {
      setDrag({ ...drag, before });
    }
  }

  function onTabDrop(event: React.DragEvent) {
    if (drag === null) {
      return;
    }
    event.preventDefault();
    reorderTab(store, drag.id, drag.before, PRIMARY_PANE_ID);
    setDrag(null);
  }

  const contextTab =
    contextTarget?.kind === "tab" ? (tabs.find((tab) => tab.id === contextTarget.id) ?? null) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {showStrip && (
        <ContextMenu
          onOpenChange={(open) => {
            if (!open) setContextTarget(null);
          }}
        >
          <ContextMenuTrigger asChild>
            <div
              className="scrollbar-none flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-sidebar-border bg-sidebar"
              role="tablist"
              aria-label="Open notes"
              onContextMenu={onStripContextMenu}
            >
              {tabs.map((tab, index) => (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  draggable={!tab.isPinned}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(TAB_DRAG_MIME, tab.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDrag({ id: tab.id, before: tab.id });
                  }}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(event) => onTabDragOver(event, tab, index)}
                  onDrop={onTabDrop}
                  className={`group flex min-w-0 max-w-[180px] items-center border-r border-sidebar-border ${
                    drag !== null && drag.before === tab.id ? "shadow-[inset_2px_0_0_0_var(--color-primary)]" : ""
                  } ${drag?.id === tab.id ? "opacity-50" : ""} ${
                    tab.isActive
                      ? "bg-theme-editor text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.isPinned && (
                    <PinIcon size={11} className="ml-2 shrink-0 fill-current" />
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab.isActive}
                    className={`min-w-0 flex-1 truncate px-3 text-left text-xs${tab.isAvailable ? "" : " line-through opacity-60"}`}
                    title={tab.isAvailable ? tab.title : `${tab.title} (in trash)`}
                    onClick={() => activateTab(store, tab.id)}
                    onAuxClick={(event) => {
                      if (event.button === 1) {
                        closeTab(store, tab.id, PRIMARY_PANE_ID);
                      }
                    }}
                  >
                    {tab.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.15] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => closeTab(store, tab.id, PRIMARY_PANE_ID)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
              <div
                className={`min-w-8 flex-1 ${
                  drag !== null && drag.before === null
                    ? "shadow-[inset_2px_0_0_0_var(--color-primary)]"
                    : ""
                }`}
                onDragOver={(event) => {
                  if (drag === null) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (drag.before !== null) {
                    setDrag({ ...drag, before: null });
                  }
                }}
                onDrop={onTabDrop}
              />
              {hasSplit && (
                <>
                  <button
                    type="button"
                    aria-label={
                      orientation === "vertical" ? "Stack split panes" : "Place split panes side by side"
                    }
                    title={
                      orientation === "vertical" ? "Stack split panes" : "Place split panes side by side"
                    }
                    className="shrink-0 self-center px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleSplitOrientation(store)}
                  >
                    {orientation === "vertical" ? (
                      <SplitViewStackedIcon size={14} />
                    ) : (
                      <SplitViewIcon size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 self-center px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => closeSplit(store)}
                  >
                    Close split
                  </button>
                </>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {contextTab ? (
              <>
                <ContextMenuItem onClick={() => togglePinTab(store, contextTab.id, PRIMARY_PANE_ID)}>
                  {contextTab.isPinned ? (
                    <PinOffIcon size={14} className="h-3.5 w-3.5" />
                  ) : (
                    <PinIcon size={14} className="h-3.5 w-3.5" />
                  )}
                  {contextTab.isPinned ? "Unpin" : "Pin"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => closeTab(store, contextTab.id, PRIMARY_PANE_ID)}>Close</ContextMenuItem>
                <ContextMenuItem onClick={() => closeOtherTabs(store, contextTab.id, PRIMARY_PANE_ID)}>
                  Close all but this
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToSide(store, contextTab.id, "right", PRIMARY_PANE_ID)}>
                  Close all to the right
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToSide(store, contextTab.id, "left", PRIMARY_PANE_ID)}>
                  Close all to the left
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => closeAllTabs(store, PRIMARY_PANE_ID)}>Close all</ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem onClick={() => closeAllTabs(store, PRIMARY_PANE_ID)}>Close all</ContextMenuItem>
                {hasSplit && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => toggleSplitOrientation(store)}>
                      {orientation === "vertical" ? "Stack split panes" : "Split panes side by side"}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={resetSplit}>Reset split size</ContextMenuItem>
                    <ContextMenuItem onClick={() => closeSplit(store)}>Close split</ContextMenuItem>
                  </>
                )}
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      )}
      <div
        ref={splitRef}
        className="grid min-h-0 min-w-0 flex-1"
        style={hasSplit ? { [trackProperty]: splitGridTemplate(ratio) } : undefined}
      >
        <div
          className="editor-pane relative min-h-0 min-w-0"
          onFocusCapture={() => focusPane(store, PRIMARY_PANE_ID)}
        >
          <EditorHost store={store} />
        </div>
        {hasSplit && (
          <>
            <SplitDivider
              orientation={orientation}
              ratio={ratio}
              onPreview={previewSplit}
              onCommit={commitSplit}
              onReset={resetSplit}
            />
            <div
              className="editor-pane relative min-h-0 min-w-0"
              onFocusCapture={() => focusPane(store, SECONDARY_PANE_ID)}
            >
              <EditorHost
                store={store}
                selectNoteId={selectSecondaryNoteId}
                emptyMessage="This note is no longer available. It may have been moved to trash."
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
