import { useState } from "react";
import {
  activateTab,
  closeAllTabs,
  closeOtherTabs,
  closeSplit,
  closeTab,
  closeTabsToSide,
  focusPane,
  togglePinTab,
} from "../actions/panes";
import { CloseIcon, PinIcon, PinOffIcon } from "../shared/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../shared/ui/context-menu";
import { PRIMARY_PANE_ID, SECONDARY_PANE_ID } from "../store/panes";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import { EditorHost } from "./editor-host";

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

export function EditorPanes({ store }: Props) {
  const panes = useRendererSelector(store, selectPanes);
  const tabs = useRendererSelector(store, tabModels, sameTabModels);
  const hasSplit = panes.length > 1;
  const showStrip = tabs.length > 1 || hasSplit;
  // A single shared context menu serves every tab; right-clicking the strip
  // resolves the tab under the cursor via `data-tab-id` instead of mounting a
  // Radix ContextMenu per tab.
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);

  function onStripContextMenu(event: React.MouseEvent) {
    const tabEl = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-id]");
    const id = tabEl?.getAttribute("data-tab-id") ?? null;
    setContextTarget(id === null ? { kind: "strip" } : { kind: "tab", id });
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
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  className={`group flex min-w-0 max-w-[180px] items-center border-r border-sidebar-border ${
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
                        closeTab(store, tab.id);
                      }
                    }}
                  >
                    {tab.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.15] hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => closeTab(store, tab.id)}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              ))}
              {hasSplit && (
                <button
                  type="button"
                  className="ml-auto shrink-0 self-center px-3 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => closeSplit(store)}
                >
                  Close split
                </button>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {contextTab ? (
              <>
                <ContextMenuItem onClick={() => togglePinTab(store, contextTab.id)}>
                  {contextTab.isPinned ? (
                    <PinOffIcon size={14} className="h-3.5 w-3.5" />
                  ) : (
                    <PinIcon size={14} className="h-3.5 w-3.5" />
                  )}
                  {contextTab.isPinned ? "Unpin" : "Pin"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => closeTab(store, contextTab.id)}>Close</ContextMenuItem>
                <ContextMenuItem onClick={() => closeOtherTabs(store, contextTab.id)}>
                  Close all but this
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToSide(store, contextTab.id, "right")}>
                  Close all to the right
                </ContextMenuItem>
                <ContextMenuItem onClick={() => closeTabsToSide(store, contextTab.id, "left")}>
                  Close all to the left
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => closeAllTabs(store)}>Close all</ContextMenuItem>
              </>
            ) : (
              <>
                <ContextMenuItem onClick={() => closeAllTabs(store)}>Close all</ContextMenuItem>
                {hasSplit && (
                  <ContextMenuItem onClick={() => closeSplit(store)}>Close split</ContextMenuItem>
                )}
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          className="editor-pane min-h-0 min-w-0 flex-1"
          onFocusCapture={() => focusPane(store, PRIMARY_PANE_ID)}
        >
          <EditorHost store={store} />
        </div>
        {hasSplit && (
          <div
            className="editor-pane min-h-0 min-w-0 flex-1 border-l border-sidebar-border"
            onFocusCapture={() => focusPane(store, SECONDARY_PANE_ID)}
          >
            <EditorHost
              store={store}
              selectNoteId={selectSecondaryNoteId}
              emptyMessage="This note is no longer available. It may have been moved to trash."
            />
          </div>
        )}
      </div>
    </div>
  );
}
