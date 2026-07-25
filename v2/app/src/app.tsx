import { useEffect, useMemo, useRef, useState } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { Sidebar } from "./shell/sidebar";
import { CommandPaletteHost } from "./shell/command-palette-host";
import { EditorPanes } from "./shell/editor-panes";
import { MetadataPanel } from "./shell/metadata-panel";
import { SettingsDialog } from "./shell/settings-dialog";
import { TrashView } from "./shell/trash-view";
import { EntityView } from "./shell/entity-view";
import { WindowControls } from "./shell/window-controls";
import { panelGridTemplate } from "./shell/panel-layout";
import { TransferReportHost } from "./export/transfer-report-host";
import { WorkspaceShortcuts } from "./shortcuts/workspace-shortcuts";
import { appRouteHash, useAppRoute } from "./app-route";
import { installBackNavigation } from "./references/reference-navigation";
import { createCommandRegistry, registryShortcutActions } from "./commands/registry";
import type { CommandUiState } from "./commands/registry";
import { createWorkspaceCommands } from "./commands/workspace-commands";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  FolderOpenIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  SettingsIcon,
  SkriuwLogo,
  Trash2Icon,
  WaypointsIcon,
} from "./shared/icons";
import { Tooltip } from "./shared/ui/tooltip";
import { useNoteNavigation } from "./shell/use-note-navigation";
import type { RendererStore } from "./store/types";

const iconButtonClass =
  "relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

const inactiveNavClass =
  "border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

const activeNavClass =
  "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none";

const toolbarIconButtonClass =
  "flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

type Props = {
  store: RendererStore;
};

export function App({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const route = useAppRoute();
  useEffect(() => installBackNavigation(store), [store]);
  const ui: CommandUiState = { route, sidebarOpen, metadataOpen, settingsOpen };
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const registry = useMemo(
    () =>
      createCommandRegistry(
        createWorkspaceCommands(store, {
          togglePalette: () => setPaletteOpen((current) => !current),
          openSettings: () => setSettingsOpen((current) => !current),
          toggleSidebar: () => setSidebarOpen((current) => !current),
          toggleMetadata: () => setMetadataOpen((current) => !current),
          navigate: (target) => {
            window.location.hash = appRouteHash(target);
          },
        }),
      ),
    [store],
  );
  const shortcutActions = useMemo(
    () => registryShortcutActions(registry, () => store.getState(), () => uiRef.current),
    [registry, store],
  );
  const gridTemplateColumns = panelGridTemplate(route, sidebarOpen, metadataOpen);
  const noteNav = useNoteNavigation(store);
  return (
    <div
      className="grid h-full grid-rows-[minmax(0,1fr)] [--window-controls-width:112px]"
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
            <Tooltip label="Notes" side="right">
              <a
                href="#/notes"
                className={`${iconButtonClass} ${route === "notes" ? activeNavClass : inactiveNavClass}`}
                aria-label="Notes"
                aria-current={route === "notes" ? "page" : undefined}
              >
                <FolderOpenIcon
                  size={18}
                  strokeWidth={1.6}
                  className={
                    route === "notes"
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/52"
                  }
                />
              </a>
            </Tooltip>
            <Tooltip label="Tags" side="right">
              <a
                href="#/tags"
                className={`${iconButtonClass} ${route === "tags" ? activeNavClass : inactiveNavClass}`}
                aria-label="Tags"
                aria-current={route === "tags" ? "page" : undefined}
              >
                <WaypointsIcon size={18} strokeWidth={1.6} />
              </a>
            </Tooltip>
            <Tooltip label="People" side="right">
              <a
                href="#/people"
                className={`${iconButtonClass} ${route === "people" ? activeNavClass : inactiveNavClass}`}
                aria-label="People"
                aria-current={route === "people" ? "page" : undefined}
              >
                <CircleIcon size={18} strokeWidth={1.6} />
              </a>
            </Tooltip>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-3 pb-4">
          <Tooltip label="Trash" side="right">
            <a
              href="#/trash"
              className={`${iconButtonClass} ${route === "trash" ? activeNavClass : inactiveNavClass}`}
              aria-label="Trash"
              aria-current={route === "trash" ? "page" : undefined}
            >
              <Trash2Icon size={18} strokeWidth={1.6} />
            </a>
          </Tooltip>
          <div className="h-px w-8 bg-sidebar-border" aria-hidden="true" />
          <Tooltip label="Settings" side="right" shortcut={formatShortcut("mod+,")}>
            <button
              type="button"
              className={`${iconButtonClass} ${settingsOpen ? activeNavClass : inactiveNavClass}`}
              aria-label="Settings"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
        </div>
      </nav>
      <div className="contents" hidden={route !== "notes"}>
        <div className="min-h-0 min-w-0 overflow-hidden" aria-hidden={!sidebarOpen}>
          {sidebarOpen ? <Sidebar store={store} /> : null}
        </div>
        <main className="flex min-w-0 flex-col">
          <div className="flex h-11 items-center gap-1 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
            <Tooltip label="Toggle sidebar" side="bottom">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className={toolbarIconButtonClass}
                aria-label="Toggle sidebar"
                aria-expanded={sidebarOpen}
              >
                <PanelLeftToggleIcon size={16} strokeWidth={1.5} />
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
                <ChevronLeftIcon size={16} strokeWidth={1.5} />
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
                <ChevronRightIcon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
            {noteNav.title && (
              <span className="ml-1 min-w-0 flex-1 truncate text-sm text-sidebar-foreground/70">
                {noteNav.title}
              </span>
            )}
            <Tooltip label="Toggle metadata" side="bottom">
              <button
                type="button"
                onClick={() => setMetadataOpen((current) => !current)}
                className={`${toolbarIconButtonClass} ml-auto`}
                style={metadataOpen ? undefined : { marginRight: "var(--window-controls-width)" }}
                aria-label="Toggle metadata"
                aria-expanded={metadataOpen}
              >
                <PanelRightToggleIcon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1">
            <EditorPanes store={store} />
          </div>
        </main>
        <div className="min-h-0 min-w-0 overflow-hidden" aria-hidden={!metadataOpen}>
          {metadataOpen ? <MetadataPanel store={store} /> : null}
        </div>
      </div>
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
      <SettingsDialog store={store} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <TransferReportHost />
      <WorkspaceShortcuts
        store={store}
        route={route}
        suspended={settingsOpen}
        activeWhileSuspended="openSettings"
        actions={shortcutActions}
      />
    </div>
  );
}
