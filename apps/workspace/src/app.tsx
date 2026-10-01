import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@remcostoeten/auth-drawer";
import { authAdapter } from "@/features/auth/adapter";
import { useSignInNudge } from "@/features/auth/use-sign-in-nudge";
import { isBrowserRuntime } from "@/bridge/runtime";
import { BrowserStorageNotice } from "@/shell/browser-storage-notice";
import { AccountMenu } from "@/shell/account-menu";
import { railActiveClass, railIconButtonClass, railInactiveClass } from "@/shell/rail-styles";
import type { SectionId } from "@/features/settings/sections/sections";
import { Sidebar } from "@/features/sidebar/sidebar";
import { CommandPaletteHost } from "@/commands/command-palette-host";
import { EditorPanes } from "@/shell/editor-panes";
import { NoteBreadcrumbs } from "@/shell/note-breadcrumbs";
import { openEditorSearch } from "@/features/editor/search-controller";
import { MetadataPanel } from "@/features/note-chrome/metadata-panel";
import { SettingsDialog } from "@/features/settings/settings-dialog";

function loadSignInDrawer() {
  return import("@/features/auth/sign-in-drawer");
}

const CloudSignInDrawer = lazy(async () => {
  const module = await loadSignInDrawer();
  return { default: module.CloudSignInDrawer };
});
import { ShortcutHelpOverlay } from "@/commands/shortcut-help-overlay";
import { TrashView } from "@/features/trash/trash-view";
import { EntityView } from "@/features/references/entity-view";
import { TasksView } from "@/features/tasks/tasks-view";
import { MediaLibraryView } from "@/features/media/media-library-view";
import { HistoryView } from "@/features/history/history-view";
import { JournalSidebar, JournalView } from "@/features/journal/journal-view";
import { WindowControls } from "@/shell/window-controls";
import { useTitleBarDoubleClickMaximize } from "@/shell/title-bar-maximize";
import { hasTauriRuntime } from "@/bridge/external-links";
import {
  FOCUS_GRID_TEMPLATE,
  panelGridTemplate,
  panelTracksWith,
  routeHasSidebar,
  type PanelTracks,
} from "@/shell/panel-layout";
import { toolbarIconButtonClass } from "@/shell/toolbar-styles";
import { PanelResizeHandle } from "@/shell/panel-resize-handle";
import {
  SIDEBAR_RESIZE_BOUNDS,
  readSidebarWidth,
  writeSidebarWidth,
} from "@/features/sidebar/sidebar-resize";
import {
  METADATA_RESIZE_BOUNDS,
  readMetadataWidth,
  writeMetadataWidth,
} from "@/shell/metadata-resize";
import { TemplatePickerHost } from "@/features/templates/template-picker";
import { LockDialogHost } from "@/features/lock/lock-dialogs";
import { NoteShareHost } from "@/features/sharing/share-dialog";
import { TransferReportHost } from "@/features/transfer/export/transfer-report-host";
import { ImportPreviewHost } from "@/features/transfer/import/import-preview-host";
import { RemoteImagePromptHost } from "@/features/transfer/import/remote-images-prompt-host";
import { ImportProgressHost } from "@/features/transfer/import/import-progress-host";
import { WorkspaceShortcuts } from "@/commands/workspace-shortcuts";
import { useShortcutHints } from "@/commands/hints";
import { RAIL_ITEMS, railModShiftKeys, type RailItem } from "@/commands/rail-items";
import { useAppRoute } from "./app-route";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import { installBackNavigation } from "@/features/references/reference-navigation";
import { scheduleSearchIndexReconciliation } from "@/features/search/index-maintenance";
import { createCommandRegistry, registryShortcutActions } from "@/commands/registry";
import type { CommandUiState } from "@/commands/registry";
import { createWorkspaceCommands } from "@/commands/workspace-commands";
import { SkriuwLogo } from "@/shared/icons/static";
import { AppIcon } from "@/shared/icons/app-icon";
import { RAIL_ICONS } from "@/shell/rail-icons";
import { TabBar } from "@/shell/tab-bar";
import { InstallBanner } from "@/shell/install-banner";
import { MobileSheet } from "@/shell/mobile-sheet";
import { FocusModeReveal } from "@/shell/focus-mode";
import { focusModeActive, readFocusMode, writeFocusMode } from "@/shell/focus-mode-model";
import {
  COMPACT_SHELL_QUERY,
  activationClosesSidebar,
  compactPanelPolicy,
  shellMode,
} from "@/shell/shell-layout";
import { edgeSwipeOpens, swipeAxis, swipeEdgeAt, type SwipeStart } from "@/shell/edge-swipe";
import { haptic } from "@/shared/lib/haptics";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { AnimatedIconsProvider } from "@/shared/icons/animated-icons-context";
import { ToastHost } from "@/shared/ui/toast";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useNoteNavigation } from "@/shell/use-note-navigation";
import { selectAnimatedIcons, selectShowToasts } from "@/features/settings/sections/selectors";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { AiOptInGate, aiSettingsCommands, selectAiEnabled } from "@/features/ai/opt-in-gate";
import { aiEditorActionCommands } from "@/features/ai/actions/editor-action-controller";
import { registerAiSettings } from "@/features/ai/ai-settings-controller";
import { voiceDictationCommands } from "@/features/ai/voice/voice-dictation-controller";

const ModelSwitcherHost = lazy(async () => {
  const module = await import("@/features/ai/models/model-switcher");
  return { default: module.ModelSwitcherHost };
});

function loadPromptPlayground() {
  return import("@/features/ai/prompts/prompt-playground");
}

const PromptPlaygroundView = lazy(async () => {
  const module = await loadPromptPlayground();
  return { default: module.PromptPlaygroundView };
});

type RailNavIconProps = {
  item: RailItem;
  position: number;
  active: boolean;
};

/** One icon in the primary navigation rail. */
function RailNavIcon({ item, position, active }: RailNavIconProps) {
  return (
    <Tooltip label={item.label} side="right" shortcut={railModShiftKeys(position)}>
      <a
        href={`#/${item.route}`}
        className={`${railIconButtonClass} ${active ? railActiveClass : railInactiveClass}`}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
      >
        <AppIcon name={RAIL_ICONS[item.actionId]} size={18} />
      </a>
    </Tooltip>
  );
}

type Props = {
  store: RendererStore;
};

function selectActiveNoteId(state: RendererState): string | null {
  return state.activeNoteId;
}

const TOOLBAR_SHORTCUT_IDS = [
  "openSettings",
  "toggleSidebar",
  "toggleMetadata",
  "previousNote",
  "nextNote",
  "findInNote",
  "toggleCommandPalette",
  "toggleFocusMode",
] as const;

function WorkspaceShell({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SectionId>("appearance");
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMounted, setSignInMounted] = useState(false);
  const signInReturnsToSettingsRef = useRef(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [metadataWidth, setMetadataWidth] = useState(readMetadataWidth);
  const [metadataResizing, setMetadataResizing] = useState(false);
  const [tracksAnimated, setTracksAnimated] = useState(true);
  const [focusMode, setFocusMode] = useState(readFocusMode);
  const panelResizing = sidebarResizing || metadataResizing;
  const settling = !panelResizing && tracksAnimated;
  const route = useAppRoute();
  const compact = useMediaQuery(COMPACT_SHELL_QUERY);
  const mode = shellMode(compact);
  const focusActive = focusModeActive(focusMode, route);
  const focusActiveRef = useRef(focusActive);
  focusActiveRef.current = focusActive;
  const shownSidebarOpen = sidebarOpen && !focusActive;
  const shownMetadataOpen = metadataOpen && !focusActive;
  const activeNoteId = useRendererSelector(store, selectActiveNoteId);
  const fullPanelsRef = useRef({ sidebarOpen: true, metadataOpen: true });
  const seenNoteRef = useRef(activeNoteId);
  const swipeRef = useRef<SwipeStart | null>(null);
  const showToasts = useRendererSelector(store, selectShowToasts);
  const animatedIcons = useRendererSelector(store, selectAnimatedIcons);
  const aiEnabled = useRendererSelector(store, selectAiEnabled);
  const { user, isPending: authPending } = useAuth();
  const shortcutHints = useShortcutHints(store, TOOLBAR_SHORTCUT_IDS);
  useEffect(() => installBackNavigation(store), [store]);
  useEffect(() => scheduleSearchIndexReconciliation(), []);
  useTitleBarDoubleClickMaximize();
  const ui: CommandUiState = {
    route,
    sidebarOpen: shownSidebarOpen,
    metadataOpen: shownMetadataOpen,
    settingsOpen,
  };
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const panelsRef = useRef({ sidebarOpen, metadataOpen });
  panelsRef.current = { sidebarOpen, metadataOpen };
  // Entering compact parks the desktop panel choices and applies the phone
  // policy; leaving it restores them, so a rotated tablet lands where it was.
  useEffect(() => {
    if (mode === "compact") {
      fullPanelsRef.current = { ...panelsRef.current };
      const policy = compactPanelPolicy(store.getState().activeNoteId !== null);
      setTracksAnimated(false);
      setSidebarOpen(policy.sidebarOpen);
      setMetadataOpen(policy.metadataOpen);
      return;
    }
    setTracksAnimated(false);
    setSidebarOpen(fullPanelsRef.current.sidebarOpen);
    setMetadataOpen(fullPanelsRef.current.metadataOpen);
  }, [mode, store]);
  // The journal calendar navigates by hash, so a day picked from the sheet
  // closes it the same way a note does.
  useEffect(() => {
    if (mode !== "compact" || route !== "journal" || !sidebarOpen) {
      return;
    }
    function onHashChange(): void {
      setSidebarOpen(false);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [mode, route, sidebarOpen]);
  // Picking a note from the overlaying tree is the end of that errand: the
  // sheet gets out of the way so the note is readable without a second tap.
  useEffect(() => {
    const previous = seenNoteRef.current;
    seenNoteRef.current = activeNoteId;
    if (activationClosesSidebar(mode, uiRef.current.sidebarOpen, previous, activeNoteId)) {
      setSidebarOpen(false);
    }
  }, [activeNoteId, mode]);
  const changeFocusMode = useCallback((enabled: boolean) => {
    setTracksAnimated(true);
    setFocusMode(enabled);
    writeFocusMode(enabled);
  }, []);
  const toggleFocusMode = useCallback(() => {
    changeFocusMode(!focusActiveRef.current);
  }, [changeFocusMode]);
  const exitFocusMode = useCallback(() => changeFocusMode(false), [changeFocusMode]);
  useEffect(() => {
    if (route !== "notes" && focusMode) {
      changeFocusMode(false);
    }
  }, [changeFocusMode, focusMode, route]);
  const toggleSidebar = useCallback(
    (animated: boolean) => {
      setTracksAnimated(animated);
      if (focusActiveRef.current) {
        changeFocusMode(false);
        setSidebarOpen(true);
        return;
      }
      setSidebarOpen((current) => !current);
    },
    [changeFocusMode],
  );
  const toggleMetadata = useCallback(
    (animated: boolean) => {
      setTracksAnimated(animated);
      if (focusActiveRef.current) {
        changeFocusMode(false);
        setMetadataOpen(true);
        return;
      }
      setMetadataOpen((current) => !current);
    },
    [changeFocusMode],
  );
  // The sign-in drawer portals to <body>, which the modal settings <dialog>
  // renders inert and covers via the top layer — so settings must close first.
  const openSignIn = useCallback((returnToSettings: boolean) => {
    signInReturnsToSettingsRef.current = returnToSettings;
    setSettingsOpen(false);
    setSignInMounted(true);
    setSignInOpen(true);
  }, []);
  const overlayOpenRef = useRef(false);
  overlayOpenRef.current = signInOpen || settingsOpen || paletteOpen || shortcutHelpOpen;
  useSignInNudge(store, isBrowserRuntime() && user === null && !authPending, () => {
    if (!overlayOpenRef.current) openSignIn(false);
  });
  // Warm the sign-in chunk as soon as either trigger surface opens, so the
  // drawer appears instantly on click instead of waiting on a lazy import.
  useEffect(() => {
    if (settingsOpen || paletteOpen) {
      void loadSignInDrawer();
      if (aiEnabled) {
        void loadPromptPlayground();
      }
    }
  }, [aiEnabled, paletteOpen, settingsOpen]);
  // The playground route is structurally gated: with AI off it must not exist,
  // so a stale or hand-typed hash lands back on notes instead of a blank shell.
  useEffect(() => {
    if (route === "prompt-playground" && !aiEnabled) {
      window.location.hash = appRouteHash("notes");
    }
  }, [aiEnabled, route]);
  const handleSignInOpenChange = useCallback((open: boolean) => {
    setSignInOpen(open);
    if (!open && signInReturnsToSettingsRef.current) {
      signInReturnsToSettingsRef.current = false;
      setSettingsOpen(true);
    }
  }, []);
  const openSettingsAt = useCallback((section: SectionId) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);
  useEffect(() => registerAiSettings(() => openSettingsAt("ai")), [openSettingsAt]);
  const registry = useMemo(
    () =>
      createCommandRegistry([
        ...createWorkspaceCommands(store, {
          togglePalette: () => setPaletteOpen((current) => !current),
          openSettings: () => setSettingsOpen((current) => !current),
          openSettingsAt,
          openSignIn: () => openSignIn(false),
          showShortcutHelp: () => setShortcutHelpOpen((current) => !current),
          toggleSidebar: () => toggleSidebar(false),
          openSidebar: () => {
            setTracksAnimated(false);
            setSidebarOpen(true);
          },
          toggleMetadata: () => toggleMetadata(false),
          toggleFocusMode,
          navigate: (target) => {
            window.location.hash = appRouteHash(target);
          },
        }),
        ...aiSettingsCommands(
          aiEnabled,
          () => openSettingsAt("ai"),
          () => {
            window.location.hash = appRouteHash("prompt-playground");
          },
        ),
        ...aiEditorActionCommands(aiEnabled),
        ...voiceDictationCommands(aiEnabled),
      ]),
    [aiEnabled, openSettingsAt, openSignIn, store, toggleFocusMode, toggleMetadata, toggleSidebar],
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
  const runCommand = useCallback(
    (commandId: string) => {
      registry.run(commandId, store.getState(), uiRef.current);
    },
    [registry, store],
  );
  const commandEnabled = useCallback(
    (commandId: string) => registry.isEnabled(commandId, store.getState(), uiRef.current),
    [registry, store],
  );
  const tracks: PanelTracks = {
    sidebarOpen,
    metadataOpen,
    sidebarWidth,
    metadataWidth,
  };
  const gridTemplateColumns = focusActive
    ? FOCUS_GRID_TEMPLATE
    : panelGridTemplate(route, sidebarOpen, metadataOpen, sidebarWidth, metadataWidth);
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
      const pane = panel === "sidebar" ? sidebarPaneRef.current : metadataPaneRef.current;
      if (pane) {
        pane.style.width = `${width}px`;
      }
    },
    [route],
  );
  const previewSidebar = useCallback(
    (width: number, collapsed: boolean) => previewPanel("sidebar", width, collapsed),
    [previewPanel],
  );
  const previewMetadata = useCallback(
    (width: number, collapsed: boolean) => previewPanel("metadata", width, collapsed),
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
  const sidebarSheetOpen = mode === "compact" && shownSidebarOpen && routeHasSidebar(route);
  const metadataSheetOpen = mode === "compact" && shownMetadataOpen && route === "notes";
  const sheetOpen = sidebarSheetOpen || metadataSheetOpen;

  // The edge strips carry `touch-action: none`, so a touch that starts on one
  // keeps delivering pointer events instead of being claimed as a pan.
  function onShellPointerDown(event: React.PointerEvent): void {
    if (event.pointerType !== "touch") {
      swipeRef.current = null;
      return;
    }
    const edge = swipeEdgeAt(event.clientX, window.innerWidth);
    swipeRef.current = edge === null ? null : { x: event.clientX, y: event.clientY, edge };
    if (edge !== null) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onShellPointerMove(event: React.PointerEvent): void {
    const start = swipeRef.current;
    if (!start) {
      return;
    }
    const axis = swipeAxis(start, event.clientX, event.clientY);
    if (axis === "y") {
      swipeRef.current = null;
      return;
    }
    const opens = edgeSwipeOpens(start, event.clientX, routeHasSidebar(route), route === "notes");
    if (opens === null) {
      return;
    }
    swipeRef.current = null;
    haptic("select");
    setTracksAnimated(true);
    if (opens === "sidebar") {
      setSidebarOpen(true);
    } else {
      setMetadataOpen(true);
    }
  }

  function onShellPointerEnd(): void {
    swipeRef.current = null;
  }

  const sidebarContent = (
    <>
      <div className="h-full" hidden={route !== "notes"}>
        <Sidebar store={store} onOpenCommandPalette={() => setPaletteOpen(true)} />
      </div>
      <div className="h-full" hidden={route !== "journal"}>
        <JournalSidebar store={store} />
      </div>
    </>
  );
  const accountMenu = (
    <AccountMenu
      store={store}
      settingsOpen={settingsOpen}
      onOpenSettings={openSettingsAt}
      onShowShortcutHelp={() => setShortcutHelpOpen(true)}
      onRunCommand={runCommand}
      isCommandEnabled={commandEnabled}
      onRequestSignIn={() => openSignIn(false)}
    />
  );
  return (
    <AnimatedIconsProvider enabled={animatedIcons}>
      <div
        ref={tracksRef}
        className={`relative grid h-full grid-rows-[minmax(0,1fr)]${
          settling && mode === "full" ? " panel-tracks-settling" : ""
        }${mode === "compact" ? " shell-compact" : ""}${focusActive ? " shell-focus-mode" : ""}`}
        style={mode === "compact" ? undefined : { gridTemplateColumns }}
        inert={sheetOpen}
      >
        {mode === "full" && (
          <nav
            aria-label="Primary"
            className={`flex w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar${
              focusActive ? " sidebar-pane-collapsed overflow-hidden" : ""
            }${settling ? " sidebar-pane-settling" : ""}`}
            aria-hidden={focusActive}
            inert={focusActive}
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
              {accountMenu}
            </div>
          </nav>
        )}
        {mode === "full" && !focusActive && routeHasSidebar(route) ? (
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
        {mode === "full" && !focusActive && route === "notes" ? (
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
        {mode === "full" && (
          <div
            className={`col-[2] min-h-0 min-w-0 overflow-hidden${
              shownSidebarOpen ? "" : " sidebar-pane-collapsed"
            }${settling ? " sidebar-pane-settling" : ""}`}
            aria-hidden={!shownSidebarOpen}
            inert={!shownSidebarOpen}
            hidden={!routeHasSidebar(route)}
          >
            <div ref={sidebarPaneRef} className="h-full" style={{ width: sidebarWidth }}>
              {sidebarContent}
            </div>
          </div>
        )}
        <div className="contents" hidden={route !== "notes"}>
          <main className="col-[3] flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div
              data-tauri-drag-region
              hidden={focusActive}
              className={`grid h-11 items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground ${
                mode === "compact"
                  ? "grid-cols-[auto_minmax(0,1fr)_auto] px-1"
                  : "grid-cols-[1fr_minmax(0,auto)_1fr]"
              }`}
            >
              <div data-tauri-drag-region className="flex min-w-0 items-center gap-1">
                <Tooltip
                  label="Toggle sidebar"
                  side="bottom"
                  shortcut={shortcutHints.toggleSidebar}
                >
                  <button
                    type="button"
                    onClick={() => toggleSidebar(true)}
                    className={toolbarIconButtonClass}
                    aria-label="Toggle sidebar"
                    aria-expanded={sidebarOpen}
                  >
                    <AppIcon name="toggle-sidebar" size={16} />
                  </button>
                </Tooltip>
                {mode === "compact" && (
                  <Tooltip
                    label="Search"
                    side="bottom"
                    shortcut={shortcutHints.toggleCommandPalette}
                  >
                    <button
                      type="button"
                      onClick={() => setPaletteOpen(true)}
                      className={toolbarIconButtonClass}
                      aria-label="Search"
                    >
                      <AppIcon name="search" size={16} />
                    </button>
                  </Tooltip>
                )}
                {mode === "full" && (
                  <>
                    <Tooltip
                      label="Previous note"
                      side="bottom"
                      shortcut={shortcutHints.previousNote}
                    >
                      <button
                        type="button"
                        onClick={noteNav.navigatePrev}
                        disabled={!noteNav.canNavigatePrev}
                        className={toolbarIconButtonClass}
                        aria-label="Previous note"
                      >
                        <AppIcon name="previous-note" size={16} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Next note" side="bottom" shortcut={shortcutHints.nextNote}>
                      <button
                        type="button"
                        onClick={noteNav.navigateNext}
                        disabled={!noteNav.canNavigateNext}
                        className={toolbarIconButtonClass}
                        aria-label="Next note"
                      >
                        <AppIcon name="next-note" size={16} />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
              <div data-tauri-drag-region className="flex min-w-0 justify-center px-2">
                <NoteBreadcrumbs store={store} titleOnly={mode === "compact"} />
              </div>
              <div data-tauri-drag-region className="flex min-w-0 items-center justify-end gap-1">
                <Tooltip label="Find in note" side="bottom" shortcut={shortcutHints.findInNote}>
                  <button
                    type="button"
                    onClick={openEditorSearch}
                    disabled={!noteNav.noteId}
                    className={toolbarIconButtonClass}
                    aria-label="Find in note"
                  >
                    <AppIcon name="find-in-note" size={16} />
                  </button>
                </Tooltip>
                <Tooltip
                  label="Toggle metadata"
                  side="bottom"
                  shortcut={shortcutHints.toggleMetadata}
                >
                  <button
                    type="button"
                    onClick={() => toggleMetadata(true)}
                    className={toolbarIconButtonClass}
                    aria-label="Toggle metadata"
                    aria-expanded={metadataOpen}
                  >
                    <AppIcon name="toggle-metadata" size={16} />
                  </button>
                </Tooltip>
                {!metadataOpen && <WindowControls className="-mr-3" />}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <EditorPanes store={store} />
            </div>
            <BrowserStorageNotice onSignIn={() => openSignIn(false)} />
          </main>
          {mode === "full" && (
            <div
              className={`col-[4] min-h-0 min-w-0 overflow-hidden${
                shownMetadataOpen ? "" : " sidebar-pane-collapsed"
              }${settling ? " sidebar-pane-settling" : ""}`}
              aria-hidden={!shownMetadataOpen}
              inert={!shownMetadataOpen}
            >
              {shownMetadataOpen ? (
                <div
                  ref={metadataPaneRef}
                  className="flex h-full flex-col"
                  style={{ width: metadataWidth }}
                >
                  {hasTauriRuntime() && (
                    <div
                      data-tauri-drag-region
                      className="flex h-11 shrink-0 items-center justify-end border-b border-l border-sidebar-border bg-sidebar"
                    >
                      <WindowControls />
                    </div>
                  )}
                  <div className="min-h-0 flex-1">
                    <MetadataPanel store={store} />
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
        {route === "history" && <HistoryView store={store} />}
        {route === "journal" && (
          <JournalView
            store={store}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => toggleSidebar(true)}
            onOpenCommandPalette={mode === "compact" ? () => setPaletteOpen(true) : undefined}
          />
        )}
        {route === "tasks" && <TasksView store={store} />}
        {route === "trash" && <TrashView store={store} />}
        {route === "media" && <MediaLibraryView store={store} />}
        {route === "prompt-playground" && (
          <AiOptInGate store={store}>
            {(signal) => (
              <Suspense fallback={null}>
                <PromptPlaygroundView store={store} signal={signal} />
              </Suspense>
            )}
          </AiOptInGate>
        )}
        {route === "tags" && <EntityView store={store} kind="tag" />}
        {route === "people" && <EntityView store={store} kind="person" />}
        {!focusActive && <InstallBanner compact={mode === "compact"} />}
        {mode === "compact" && !focusActive && <TabBar route={route} account={accountMenu} />}
        {mode === "compact" && !focusActive && routeHasSidebar(route) && (
          <div
            className="shell-edge-left absolute top-11 bottom-14 left-0 z-30 w-5 touch-none"
            aria-hidden="true"
            onPointerDown={onShellPointerDown}
            onPointerMove={onShellPointerMove}
            onPointerUp={onShellPointerEnd}
            onPointerCancel={onShellPointerEnd}
          />
        )}
        {mode === "compact" && !focusActive && route === "notes" && (
          <div
            className="absolute top-11 bottom-14 right-0 z-30 w-5 touch-none"
            aria-hidden="true"
            onPointerDown={onShellPointerDown}
            onPointerMove={onShellPointerMove}
            onPointerUp={onShellPointerEnd}
            onPointerCancel={onShellPointerEnd}
          />
        )}
        <FocusModeReveal
          store={store}
          active={focusActive}
          shortcut={shortcutHints.toggleFocusMode}
          onExit={exitFocusMode}
        />
      </div>
      {mode === "compact" && (
        <MobileSheet
          side="left"
          open={sidebarSheetOpen}
          label={route === "journal" ? "Journal calendar" : "Notes"}
          onClose={() => setSidebarOpen(false)}
        >
          {sidebarContent}
        </MobileSheet>
      )}
      {mode === "compact" && (
        <MobileSheet
          side="right"
          open={metadataSheetOpen}
          label="Note details"
          onClose={() => setMetadataOpen(false)}
        >
          <MetadataPanel store={store} />
        </MobileSheet>
      )}
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
        onRequestSignIn={() => openSignIn(true)}
        section={settingsSection}
        onSectionChange={setSettingsSection}
      />
      {signInMounted ? (
        <Suspense fallback={null}>
          <CloudSignInDrawer open={signInOpen} onOpenChange={handleSignInOpenChange} />
        </Suspense>
      ) : null}
      <ShortcutHelpOverlay
        store={store}
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
      />
      <ToastHost visible={showToasts} />
      <TemplatePickerHost store={store} />
      <LockDialogHost store={store} />
      <NoteShareHost store={store} onRequestSignIn={() => openSignIn(false)} />
      <AiOptInGate store={store}>
        {() => (
          <Suspense fallback={null}>
            <ModelSwitcherHost store={store} openAiSettings={() => openSettingsAt("ai")} />
          </Suspense>
        )}
      </AiOptInGate>
      <TransferReportHost />
      <ImportPreviewHost />
      <RemoteImagePromptHost />
      <ImportProgressHost />
      <WorkspaceShortcuts
        store={store}
        route={route}
        suspended={settingsOpen || shortcutHelpOpen}
        activeWhileSuspended={settingsOpen ? "openSettings" : undefined}
        actions={shortcutActions}
      />
    </AnimatedIconsProvider>
  );
}

/**
 * The cloud session is provided above the whole shell, not just the settings
 * dialog, because the rail account menu reads it while settings is closed.
 */
export function App({ store }: Props) {
  return (
    <AuthProvider adapter={authAdapter}>
      <WorkspaceShell store={store} />
    </AuthProvider>
  );
}
