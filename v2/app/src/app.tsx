import { useState } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { Sidebar } from "./shell/sidebar";
import { CommandPaletteHost } from "./shell/command-palette-host";
import { EditorHost } from "./shell/editor-host";
import { MetadataPanel } from "./shell/metadata-panel";
import { SettingsDialog } from "./shell/settings-dialog";
import { WorkspaceShortcuts } from "./shortcuts/workspace-shortcuts";
import { createFolder, createNote } from "./actions/workspace";
import {
  BookOpenIcon,
  CompassIcon,
  FolderOpenIcon,
  ListTodoIcon,
  SettingsIcon,
  SkriuwLogo,
  Trash2Icon,
} from "./shared/icons";
import { Tooltip } from "./shared/ui/tooltip";
import type { RendererStore } from "./store/types";

type Props = {
  store: RendererStore;
};

export function App({ store }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="shell">
      <nav className="icon-rail" aria-label="Primary">
        <div className="icon-rail-logo">
          <SkriuwLogo size={26} />
        </div>
        <div className="icon-rail-nav">
          <Tooltip label="Notes" side="right">
            <button type="button" className="icon-rail-button is-active" aria-label="Notes">
              <FolderOpenIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
          <Tooltip label="Journal" side="right">
            <button type="button" className="icon-rail-button" aria-label="Journal" disabled>
              <BookOpenIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
          <Tooltip label="Tasks" side="right">
            <button type="button" className="icon-rail-button" aria-label="Tasks" disabled>
              <ListTodoIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
          <Tooltip label="Explore" side="right">
            <button type="button" className="icon-rail-button" aria-label="Explore" disabled>
              <CompassIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
        </div>
        <div className="icon-rail-bottom">
          <Tooltip label="Trash" side="right">
            <button type="button" className="icon-rail-button" aria-label="Trash" disabled>
              <Trash2Icon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
          <div className="icon-rail-divider" aria-hidden="true" />
          <Tooltip label="Settings" side="right" shortcut={formatShortcut("mod+,")}>
            <button
              type="button"
              className="icon-rail-button"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon size={18} strokeWidth={1.6} />
            </button>
          </Tooltip>
        </div>
      </nav>
      <Sidebar store={store} />
      <main className="editor-pane">
        <EditorHost store={store} />
      </main>
      <MetadataPanel store={store} />
      <CommandPaletteHost store={store} open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SettingsDialog store={store} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <WorkspaceShortcuts
        store={store}
        suspended={settingsOpen}
        actions={{
          toggleCommandPalette: () => setPaletteOpen((current) => !current),
          createNote: () => createNote(store, null),
          createFolder: () => createFolder(store, null),
          openSettings: () => setSettingsOpen(true),
        }}
      />
    </div>
  );
}
