import { PanelLeftIcon, SearchIcon } from "@/shared/icons/static";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { WindowControls } from "@/shell/title-bar";
import { toolbarIconButtonClass } from "@/shared/ui/toolbar-button";
import { useShortcutHints } from "@/commands/hints";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { formatLongDate } from "@skriuw/renderer-core/journal/dates";
import { JournalEntryPane } from "./entry/pane";
import { JournalGoToDateHost } from "./navigation/go-to-date-dialog";
import { useSelectedJournalKey } from "./navigation/selected-day";

type Props = {
  store: RendererStore;
};

type JournalViewProps = Props & {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** Present only when the shell has no other one-tap route to the palette. */
  onOpenCommandPalette?: () => void;
};

const JOURNAL_SHORTCUT_IDS = ["toggleSidebar", "toggleCommandPalette"] as const;

export function JournalView({
  store,
  sidebarOpen,
  onToggleSidebar,
  onOpenCommandPalette,
}: JournalViewProps) {
  const selectedKey = useSelectedJournalKey();
  const shortcutHints = useShortcutHints(store, JOURNAL_SHORTCUT_IDS);
  return (
    <main className="col-[3/-1] flex min-h-0 min-w-0 flex-col" aria-label="Journal">
      <div
        data-tauri-drag-region
        className="flex h-11 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground"
      >
        <Tooltip label="Toggle sidebar" side="bottom" shortcut={shortcutHints.toggleSidebar}>
          <button
            type="button"
            onClick={onToggleSidebar}
            className={toolbarIconButtonClass}
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <PanelLeftIcon size={16} />
          </button>
        </Tooltip>
        {onOpenCommandPalette && (
          <Tooltip label="Search" side="bottom" shortcut={shortcutHints.toggleCommandPalette}>
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className={toolbarIconButtonClass}
              aria-label="Search"
            >
              <SearchIcon size={16} />
            </button>
          </Tooltip>
        )}
        <div className="pointer-events-none flex flex-1 items-center justify-center gap-3 text-sm">
          <span className="text-sidebar-foreground/58">Journal</span>
          <span className="max-w-[28rem] truncate font-medium text-sidebar-foreground/80">
            {formatLongDate(selectedKey)}
          </span>
        </div>
        <WindowControls className="-mr-3" />
      </div>
      <div className="min-h-0 flex-1">
        <JournalEntryPane store={store} selectedKey={selectedKey} />
      </div>
      <JournalGoToDateHost selectedKey={selectedKey} />
    </main>
  );
}
