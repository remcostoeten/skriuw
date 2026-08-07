import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { Sidebar } from "./shell/sidebar";
import { CommandPaletteHost } from "./shell/command-palette-host";
import { EditorPanes } from "./shell/editor-panes";
import { MetadataPanel } from "./shell/metadata-panel";
import { SettingsDialog } from "./shell/settings-dialog";
import { ShortcutHelpOverlay } from "./shell/shortcut-help-overlay";
import { TrashView } from "./shell/trash-view";
import { EntityView } from "./shell/entity-view";
import { HistoryView } from "./history/history-view";
import { JournalSidebar, JournalView } from "./journal/journal-view";
import { WindowControls } from "./shell/window-controls";
import {
  panelGridTemplate,
  panelTracksWith,
  routeHasSidebar,
  type PanelTracks,
} from "./shell/panel-layout";
import { toolbarIconButtonClass } from "./shell/toolbar-styles";
import { PanelResizeHandle } from "./shell/panel-resize-handle";
import {
  SIDEBAR_RESIZE_BOUNDS,
  readSidebarWidth,
  writeSidebarWidth,
} from "./shell/sidebar-resize";
import {
  METADATA_RESIZE_BOUNDS,
  readMetadataWidth,
  writeMetadataWidth,
} from "./shell/metadata-resize";
import { TemplatePickerHost } from "./templates/template-picker";
import { TransferReportHost } from "./export/transfer-report-host";
import { ImportPreviewHost } from "./import/import-preview-host";
import { ImportProgressHost } from "./import/import-progress-host";
import { WorkspaceShortcuts } from "./shortcuts/workspace-shortcuts";
import {
  RAIL_ITEMS,
  formatRailSequenceHint,
  railModShiftKeys,
  type RailItem,
} from "./shortcuts/rail-items";
import { appRouteHash, noteHistoryHash, useAppRoute } from "./app-route";
import { installBackNavigation } from "./references/reference-navigation";
import {
  createCommandRegistry,
  registryShortcutActions,
} from "./commands/registry";
import type { CommandUiState } from "./commands/registry";
import { createWorkspaceCommands } from "./commands/workspace-commands";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  HistoryIcon,
  FolderOpenIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  SettingsIcon,
  SkriuwLogo,
  Trash2Icon,
  WaypointsIcon,
} from "./shared/icons";
import { ToastHost } from "./shared/ui/toast";
import { Tooltip } from "./shared/ui/tooltip";
import { useNoteNavigation } from "./shell/use-note-navigation";
import { selectShowToasts } from "./shell/settings/selectors";
import { useRendererSelector } from "./store/use-renderer-selector";
import type { RendererStore } from "./store/types";

const iconButtonClass =
  "relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

const inactiveNavClass =
  "border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

const activeNavClass =
  "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none";

const RAIL_ICONS: Record<RailItem["actionId"], typeof FolderOpenIcon> = {
  goToNotes: FolderOpenIcon,
  goToJournal: CalendarDaysIcon,
  goToTags: WaypointsIcon,
  goToPeople: CircleIcon,
  goToTrash: Trash2Icon,
};

type RailNavIconProps = {
  item: RailItem;
  position: number;
  active: boolean;
};

/**
 * One icon in the primary navigation rail. `position` is the item's 1-based
 * index in `RAIL_ITEMS`, which both `mod+shift+<n>` and the `g then t then
 * <n>` sequence key off of, so the tooltip always shows the combo that
 * actually fires for this icon.
 */
function RailNavIcon({ item, position, active }: RailNavIconProps) {
  const Icon = RAIL_ICONS[item.actionId];
  return (
    <Tooltip
      label={item.label}
      side="right"
      shortcut={`${formatShortcut(railModShiftKeys(position))} · ${formatRailSequenceHint(position)}`}
    >
      <a
        href={`#/${item.route}`}
        className={`${iconButtonClass} ${active ? activeNavClass : inactiveNavClass}`}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={18} />
      </a>
    </Tooltip>
  );
}

type Props = {
  store: RendererStore;
};

export function App({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [metadataWidth, setMetadataWidth] = useState(readMetadataWidth);
  const [metadataResizing, setMetadataResizing] = useState(false);
  const [tracksAnimated, setTracksAnimated] = useState(true);
  const panelResizing = sidebarResizing || metadataResizing;
  const settling = !panelResizing && tracksAnimated;
  const route = useAppRoute();
  const showToasts = useRendererSelector(store, selectShowToasts);
  useEffect(() => installBackNavigation(store), [store]);
  const ui: CommandUiState = { route, sidebarOpen, metadataOpen, settingsOpen };
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const toggleSidebar = useCallback((animated: boolean) => {
    setTracksAnimated(animated);
    setSidebarOpen((current) => !current);
  }, []);
  const toggleMetadata = useCallback((animated: boolean) => {
    setTracksAnimated(animated);
    setMetadataOpen((current) => !current);
  }, []);
  const registry = useMemo(
    () =>
      createCommandRegistry(
        createWorkspaceCommands(store, {
          togglePalette: () => setPaletteOpen((current) => !current),
          openSettings: () => setSettingsOpen((current) => !current),
          showShortcutHelp: () => setShortcutHelpOpen((current) => !current),
          toggleSidebar: () => toggleSidebar(false),
          openSidebar: () => {
            setTracksAnimated(false);
            setSidebarOpen(true);
          },
          toggleMetadata: () => toggleMetadata(false),
          navigate: (target) => {
            window.location.hash = appRouteHash(target);
          },
        }),
      ),
    [store, toggleMetadata, toggleSidebar],
  );
  const shortcutActions = useMemo(
    () =>
      registryShortcutActions(
        registry,
        () => store.getState(),
        () => uiRef.current,
      ),
    [registry, store],
  );
  const tracks: PanelTracks = {
    sidebarOpen,
    metadataOpen,
    sidebarWidth,
    metadataWidth,
  };
  const gridTemplateColumns = panelGridTemplate(
    route,
    sidebarOpen,
    metadataOpen,
    sidebarWidth,
    metadataWidth,
  );
  const noteNav = useNoteNavigation(store);
  const tracksRef = useRef<HTMLDivElement>(null);
  const sidebarPaneRef = useRef<HTMLDivElement>(null);
  const metadataPaneRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(tracks);
  settledRef.current = tracks;

  /**
   * Drags repaint through direct writes to the grid container and the dragged
   * pane. Both properties are non-inherited, so the browser only restyles those
   * two elements — and React does no work at all until the pointer is released.
   */
  const previewPanel = useCallback(
    (panel: "sidebar" | "metadata", width: number, collapsed: boolean) => {
      const next = panelTracksWith(settledRef.current, panel, width, collapsed);
      const container = tracksRef.current;
      if (container) {
        container.style.gridTemplateColumns = panelGridTemplate(
          route,
          next.sidebarOpen,
          next.metadataOpen,
          next.sidebarWidth,
          next.metadataWidth,
        );
      }
      const pane =
        panel === "sidebar" ? sidebarPaneRef.current : metadataPaneRef.current;
      if (pane) {
        pane.style.width = `${width}px`;
      }
    },
    [route],
  );
  const previewSidebar = useCallback(
    (width: number, collapsed: boolean) =>
      previewPanel("sidebar", width, collapsed),
    [previewPanel],
  );
  const previewMetadata = useCallback(
    (width: number, collapsed: boolean) =>
      previewPanel("metadata", width, collapsed),
    [previewPanel],
  );
  const resizeSidebar = useCallback((width: number) => {
    setSidebarWidth(width);
    writeSidebarWidth(width);
  }, []);
  const collapseSidebar = useCallback(() => {
    setTracksAnimated(true);
    setSidebarOpen(false);
  }, []);
  const expandSidebar = useCallback(() => {
    setTracksAnimated(true);
    setSidebarOpen(true);
  }, []);
  const resizeMetadata = useCallback((width: number) => {
    setMetadataWidth(width);
    writeMetadataWidth(width);
  }, []);
  const collapseMetadata = useCallback(() => {
    setTracksAnimated(true);
    setMetadataOpen(false);
  }, []);
  const expandMetadata = useCallback(() => {
    setTracksAnimated(true);
    setMetadataOpen(true);
  }, []);
  return (
    <div
      ref={tracksRef}
      className={`relative grid h-full grid-rows-[minmax(0,1fr)] [--window-controls-width:112px]${
        settling ? " panel-tracks-settling" : ""
      }`}
      style={{ gridTemplateColumns }}
    >
      <WindowControls />
      <nav
        aria-label="Primary"
        className="flex w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar"
      >
        <div className="flex w-full flex-col items-center">
          <div className="flex h-11 w-full items-center justify-center border-b border-sidebar-border">
            <Tooltip label="Skriuw" side="right">
              <a
                href="#/notes"
                className="rounded-2xl border border-transparent p-1.5 text-sidebar-foreground/92 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                aria-label="Go to home"
              >
                <SkriuwLogo size={26} />
              </a>
            </Tooltip>
          </div>
          <div className="mt-4 flex w-full flex-col items-center gap-4">
            {RAIL_ITEMS.filter((item) => item.section === "primary").map((item) => (
              <RailNavIcon
                key={item.actionId}
                item={item}
                position={RAIL_ITEMS.indexOf(item) + 1}
                active={route === item.route}
              />
            ))}
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-3 pb-4">
          {RAIL_ITEMS.filter((item) => item.section === "utility").map((item) => (
            <RailNavIcon
              key={item.actionId}
              item={item}
              position={RAIL_ITEMS.indexOf(item) + 1}
              active={route === item.route}
            />
          ))}
          <div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
          <Tooltip
            label="Settings"
            side="right"
            shortcut={formatShortcut("mod+,")}
          >
            <button
              type="button"
              className={`${iconButtonClass} ${settingsOpen ? activeNavClass : inactiveNavClass}`}
              aria-label="Settings"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon size={18} />
            </button>
          </Tooltip>
        </div>
      </nav>
      {routeHasSidebar(route) ? (
        <PanelResizeHandle
          side="left"
          label="Resize sidebar"
          bounds={SIDEBAR_RESIZE_BOUNDS}
          width={sidebarWidth}
          collapsed={!sidebarOpen}
          offsetBase={56}
          settling={settling}
          onPreview={previewSidebar}
          onResize={resizeSidebar}
          onCollapse={collapseSidebar}
          onExpand={expandSidebar}
          onDragChange={setSidebarResizing}
        />
      ) : null}
      {route === "notes" ? (
        <PanelResizeHandle
          side="right"
          label="Resize metadata panel"
          bounds={METADATA_RESIZE_BOUNDS}
          width={metadataWidth}
          collapsed={!metadataOpen}
          offsetBase={0}
          settling={settling}
          onPreview={previewMetadata}
          onResize={resizeMetadata}
          onCollapse={collapseMetadata}
          onExpand={expandMetadata}
          onDragChange={setMetadataResizing}
        />
      ) : null}
      <div
        className={`col-[2] min-h-0 min-w-0 overflow-hidden${
          sidebarOpen ? "" : " sidebar-pane-collapsed"
        }${settling ? " sidebar-pane-settling" : ""}`}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        hidden={!routeHasSidebar(route)}
      >
        <div
          ref={sidebarPaneRef}
          className="h-full"
          style={{ width: sidebarWidth }}
        >
          <div className="h-full" hidden={route !== "notes"}>
            <Sidebar store={store} />
          </div>
          <div className="h-full" hidden={route !== "journal"}>
            <JournalSidebar store={store} />
          </div>
        </div>
      </div>
      <div className="contents" hidden={route !== "notes"}>
        <main className="col-[3] flex min-w-0 flex-col">
          <div className="flex h-11 items-center gap-1 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
            <Tooltip label="Toggle sidebar" side="bottom">
              <button
                type="button"
                onClick={() => toggleSidebar(true)}
                className={toolbarIconButtonClass}
                aria-label="Toggle sidebar"
                aria-expanded={sidebarOpen}
              >
                <PanelLeftToggleIcon size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Previous note" side="bottom">
              <button
                type="button"
                onClick={noteNav.navigatePrev}
                disabled={!noteNav.canNavigatePrev}
                className={toolbarIconButtonClass}
                aria-label="Previous note"
              >
                <ChevronLeftIcon size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Next note" side="bottom">
              <button
                type="button"
                onClick={noteNav.navigateNext}
                disabled={!noteNav.canNavigateNext}
                className={toolbarIconButtonClass}
                aria-label="Next note"
              >
                <ChevronRightIcon size={16} />
              </button>
            </Tooltip>
            {noteNav.title && (
              <span className="ml-1 min-w-0 flex-1 truncate text-sm text-sidebar-foreground/70">
                {noteNav.title}
              </span>
            )}
            <Tooltip label="Version history" side="bottom">
              <button
                type="button"
                onClick={() => {
                  if (noteNav.noteId) {
                    window.location.hash = noteHistoryHash(noteNav.noteId);
                  }
                }}
                disabled={!noteNav.noteId}
                className={`${toolbarIconButtonClass} ml-auto`}
                aria-label="Version history"
              >
                <HistoryIcon size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Toggle metadata" side="bottom">
              <button
                type="button"
                onClick={() => toggleMetadata(true)}
                className={toolbarIconButtonClass}
                style={
                  metadataOpen
                    ? undefined
                    : { marginRight: "var(--window-controls-width)" }
                }
                aria-label="Toggle metadata"
                aria-expanded={metadataOpen}
              >
                <PanelRightToggleIcon size={16} />
              </button>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1">
            <EditorPanes store={store} />
          </div>
        </main>
        <div
          className={`col-[4] min-h-0 min-w-0 overflow-hidden${
            metadataOpen ? "" : " sidebar-pane-collapsed"
          }${settling ? " sidebar-pane-settling" : ""}`}
          aria-hidden={!metadataOpen}
          inert={!metadataOpen}
        >
          {metadataOpen ? (
            <div
              ref={metadataPaneRef}
              className="h-full"
              style={{ width: metadataWidth }}
            >
              <MetadataPanel store={store} />
            </div>
          ) : null}
        </div>
      </div>
      {route === "history" && <HistoryView store={store} />}
      {route === "journal" && (
        <JournalView
          store={store}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => toggleSidebar(true)}
        />
      )}
      {route === "trash" && <TrashView store={store} />}
      {route === "tags" && <EntityView store={store} kind="tag" />}
      {route === "people" && <EntityView store={store} kind="person" />}
      <CommandPaletteHost
        store={store}
        registry={registry}
        ui={ui}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
      <SettingsDialog
        store={store}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <ShortcutHelpOverlay
        store={store}
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
      />
      <ToastHost visible={showToasts} />
      <TemplatePickerHost store={store} />
      <TransferReportHost />
      <ImportPreviewHost />
      <ImportProgressHost />
      <WorkspaceShortcuts
        store={store}
        route={route}
        suspended={settingsOpen || shortcutHelpOpen}
        activeWhileSuspended={settingsOpen ? "openSettings" : undefined}
        actions={shortcutActions}
      />
    </div>
  );
}
