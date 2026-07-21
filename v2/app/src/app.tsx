import { useMemo, useRef, useState } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { Sidebar } from "./shell/sidebar";
import { CommandPaletteHost } from "./shell/command-palette-host";
import { EditorHost } from "./shell/editor-host";
import { MetadataPanel } from "./shell/metadata-panel";
import { SettingsDialog } from "./shell/settings-dialog";
import { TrashView } from "./shell/trash-view";
import { WindowControls } from "./shell/window-controls";
import { WorkspaceShortcuts } from "./shortcuts/workspace-shortcuts";
import { appRouteHash, useAppRoute } from "./app-route";
import { createCommandRegistry, registryShortcutActions } from "./commands/registry";
import type { CommandUiState } from "./commands/registry";
import { createWorkspaceCommands } from "./commands/workspace-commands";
import {
  FolderOpenIcon,
  PanelLeftToggleIcon,
  PanelRightToggleIcon,
  SettingsIcon,
  SkriuwLogo,
  Trash2Icon,
} from "./shared/icons";
import { Tooltip } from "./shared/ui/tooltip";
import type { RendererStore } from "./store/types";

const iconButtonClass =
  "relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200";

const inactiveNavClass =
  "border-transparent text-sidebar-foreground/52 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground";

const activeNavClass =
  "border-transparent bg-sidebar-accent/75 text-sidebar-accent-foreground shadow-none";

const toolbarIconButtonClass =
  "flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground";

type Props = {
  store: RendererStore;
};

export function App({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [metadataOpen, setMetadataOpen] = useState(true);
  const route = useAppRoute();
  const ui: CommandUiState = { route, sidebarOpen, metadataOpen, settingsOpen };
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const registry = useMemo(
    () =>
      createCommandRegistry(
        createWorkspaceCommands(store, {
          togglePalette: () => setPaletteOpen((current) => !current),
          openSettings: () => setSettingsOpen(true),
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
  const gridTemplateColumns = `56px${route === "notes" && sidebarOpen ? " 260px" : ""} 1fr${
    route === "notes" && metadataOpen ? " 240px" : ""
  }`;
  return (
    <div className="shell" style={{ gridTemplateColumns }}>
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
      <div className="notes-view" hidden={route !== "notes"}>
        {sidebarOpen && <Sidebar store={store} />}
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
            <Tooltip label="Toggle metadata" side="bottom">
              <button
                type="button"
                onClick={() => setMetadataOpen((current) => !current)}
                className={`${toolbarIconButtonClass} ml-auto`}
                aria-label="Toggle metadata"
                aria-expanded={metadataOpen}
              >
                <PanelRightToggleIcon size={16} strokeWidth={1.5} />
              </button>
            </Tooltip>
          </div>
          <div className="editor-pane min-h-0 flex-1">
            <EditorHost store={store} />
          </div>
        </main>
        {metadataOpen && <MetadataPanel store={store} />}
      </div>
      {route === "trash" && <TrashView store={store} />}
      <CommandPaletteHost
        store={store}
        registry={registry}
        ui={ui}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
      <SettingsDialog store={store} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <WorkspaceShortcuts store={store} suspended={settingsOpen} actions={shortcutActions} />
    </div>
  );
}
