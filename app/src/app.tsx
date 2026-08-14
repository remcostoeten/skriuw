import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider } from "@remcostoeten/auth-drawer";
import { updateSettings } from "@/store/actions/settings";
import { authAdapter } from "@/features/auth/adapter";
import {
  clearOnboardingOverride,
  readOnboardingOverride,
} from "@/features/onboarding/debug-override";
import { completeOnboarding, shouldShowOnboarding } from "@/features/onboarding/model";
import { Onboarding } from "@/features/onboarding/onboarding";
import { AccountMenu } from "@/shell/account-menu";
import {
  railActiveClass,
  railIconButtonClass,
  railInactiveClass,
} from "@/shell/rail-styles";
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
import { HistoryView } from "@/features/history/history-view";
import { JournalSidebar, JournalView } from "@/features/journal/journal-view";
import { WindowControls } from "@/shell/window-controls";
import { hasTauriRuntime } from "@/bridge/external-links";
import {
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
import { TransferReportHost } from "@/features/transfer/export/transfer-report-host";
import { ImportPreviewHost } from "@/features/transfer/import/import-preview-host";
import { ImportProgressHost } from "@/features/transfer/import/import-progress-host";
import { WorkspaceShortcuts } from "@/commands/workspace-shortcuts";
import { useShortcutHints } from "@/commands/hints";
import {
  RAIL_ITEMS,
  railModShiftKeys,
  type RailItem,
} from "@/commands/rail-items";
import { appRouteHash, noteHistoryHash, useAppRoute } from "./app-route";
import { installBackNavigation } from "@/features/references/reference-navigation";
import {
  createCommandRegistry,
  registryShortcutActions,
} from "@/commands/registry";
import type { CommandUiState } from "@/commands/registry";
import { createWorkspaceCommands } from "@/commands/workspace-commands";
import { SkriuwLogo } from "@/shared/icons/static";
import { AppIcon } from "@/shared/icons/app-icon";
import { AnimatedIconsProvider } from "@/shared/icons/animated-icons-context";
import type { AppIconName } from "@/shared/icons/registry";
import { ToastHost } from "@/shared/ui/toast";
import { Tooltip } from "@/shared/ui/tooltip";
import { useNoteNavigation } from "@/shell/use-note-navigation";
import { selectAnimatedIcons, selectShowToasts } from "@/features/settings/sections/selectors";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";

const RAIL_ICONS: Record<RailItem["actionId"], AppIconName> = {
  goToNotes: "notes",
  goToJournal: "journal",
  goToTags: "tags",
  goToPeople: "people",
  goToTrash: "trash",
};

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

function selectNeedsOnboarding(state: RendererState): boolean {
  return shouldShowOnboarding(state.settings);
}

const TOOLBAR_SHORTCUT_IDS = [
  "openSettings",
  "toggleSidebar",
  "toggleMetadata",
  "previousNote",
  "nextNote",
  "findInNote",
] as const;

function WorkspaceShell({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SectionId>("appearance");
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInMounted, setSignInMounted] = useState(false);
  const [openingOnboardingSignIn, setOpeningOnboardingSignIn] = useState(false);
  const [onboardingSignInError, setOnboardingSignInError] = useState<string | null>(null);
  const signInReturnsToSettingsRef = useRef(false);
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
  const animatedIcons = useRendererSelector(store, selectAnimatedIcons);
  const [onboardingOverride, setOnboardingOverride] = useState(readOnboardingOverride);
  const needsOnboarding =
    useRendererSelector(store, selectNeedsOnboarding) || onboardingOverride;
  const shortcutHints = useShortcutHints(store, TOOLBAR_SHORTCUT_IDS);
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
  // The sign-in drawer portals to <body>, which the modal settings <dialog>
  // renders inert and covers via the top layer — so settings must close first.
  const openSignIn = useCallback((returnToSettings: boolean) => {
    signInReturnsToSettingsRef.current = returnToSettings;
    setSettingsOpen(false);
    setSignInMounted(true);
    setSignInOpen(true);
  }, []);
  // Warm the sign-in chunk as soon as either trigger surface opens, so the
  // drawer appears instantly on click instead of waiting on a lazy import.
  useEffect(() => {
    if (settingsOpen || paletteOpen) {
      void loadSignInDrawer();
    }
  }, [paletteOpen, settingsOpen]);
  const handleSignInOpenChange = useCallback((open: boolean) => {
    setSignInOpen(open);
    if (!open && signInReturnsToSettingsRef.current) {
      signInReturnsToSettingsRef.current = false;
      setSettingsOpen(true);
    }
  }, []);
  const finishOnboarding = useCallback(() => {
    clearOnboardingOverride();
    setOnboardingOverride(false);
    updateSettings(store, completeOnboarding(store.getState().settings));
  }, [store]);
  const openOnboardingSignIn = useCallback(() => {
    if (openingOnboardingSignIn) return;
    setOpeningOnboardingSignIn(true);
    setOnboardingSignInError(null);
    void loadSignInDrawer()
      .then(() => {
        finishOnboarding();
        setSignInMounted(true);
        setSignInOpen(true);
      })
      .catch((error) => {
        console.error("cloud sign-in UI failed to load", error);
        setOnboardingSignInError("Sign in couldn't open. Check your connection and try again.");
      })
      .finally(() => setOpeningOnboardingSignIn(false));
  }, [finishOnboarding, openingOnboardingSignIn]);
  const warmSignInDrawer = useCallback(() => {
    void loadSignInDrawer().catch(() => undefined);
  }, []);
  const openSettingsAt = useCallback((section: SectionId) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);
  const registry = useMemo(
    () =>
      createCommandRegistry(
        createWorkspaceCommands(store, {
          togglePalette: () => setPaletteOpen((current) => !current),
          openSettings: () => setSettingsOpen((current) => !current),
          openSignIn: () => openSignIn(false),
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
    [openSignIn, store, toggleMetadata, toggleSidebar],
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
    <AnimatedIconsProvider enabled={animatedIcons}>
      <div
        ref={tracksRef}
        className={`relative grid h-full grid-rows-[minmax(0,1fr)]${
          settling ? " panel-tracks-settling" : ""
        }`}
        style={{ gridTemplateColumns }}
        aria-hidden={needsOnboarding}
        inert={needsOnboarding}
      >
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
          <AccountMenu
            store={store}
            settingsOpen={settingsOpen}
            onOpenSettings={openSettingsAt}
            onShowShortcutHelp={() => setShortcutHelpOpen(true)}
            onRunCommand={runCommand}
            isCommandEnabled={commandEnabled}
          />
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
            <Sidebar store={store} onOpenCommandPalette={() => setPaletteOpen(true)} />
          </div>
          <div className="h-full" hidden={route !== "journal"}>
            <JournalSidebar store={store} />
          </div>
        </div>
      </div>
      <div className="contents" hidden={route !== "notes"}>
        <main className="col-[3] flex min-w-0 flex-col">
          <div className="grid h-11 grid-cols-[1fr_minmax(0,auto)_1fr] items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
            <div className="flex min-w-0 items-center gap-1">
            <Tooltip label="Toggle sidebar" side="bottom" shortcut={shortcutHints.toggleSidebar}>
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
            <Tooltip label="Previous note" side="bottom" shortcut={shortcutHints.previousNote}>
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
            </div>
            <div className="flex min-w-0 justify-center px-2">
              <NoteBreadcrumbs store={store} />
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1">
            <Tooltip label="Version history" side="bottom">
              <button
                type="button"
                onClick={() => {
                  if (noteNav.noteId) {
                    window.location.hash = noteHistoryHash(noteNav.noteId);
                  }
                }}
                disabled={!noteNav.noteId}
                className={toolbarIconButtonClass}
                aria-label="Version history"
              >
                <AppIcon name="version-history" size={16} />
              </button>
            </Tooltip>
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
            <Tooltip label="Toggle metadata" side="bottom" shortcut={shortcutHints.toggleMetadata}>
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
      <TransferReportHost />
      <ImportPreviewHost />
      <ImportProgressHost />
      <WorkspaceShortcuts
        store={store}
        route={route}
        suspended={settingsOpen || shortcutHelpOpen || needsOnboarding}
        activeWhileSuspended={settingsOpen ? "openSettings" : undefined}
        actions={shortcutActions}
      />
      </div>
      {needsOnboarding ? (
        <WindowControls className="fixed right-0 top-0 z-50" />
      ) : null}
      {needsOnboarding ? (
        <Onboarding
          openingSignIn={openingOnboardingSignIn}
          signInError={onboardingSignInError}
          onContinueLocal={finishOnboarding}
          onSignIn={openOnboardingSignIn}
          onWarmSignIn={warmSignInDrawer}
        />
      ) : null}
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
