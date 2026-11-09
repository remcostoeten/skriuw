import { useShortcutHints } from "@/commands/hints";
import { CommandIcon, PlusIcon } from "@/shared/icons/static";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { selectNoteTotal } from "../tree/note-counts";
import { createNote } from "../tree/operations";

type Props = {
  store: RendererStore;
  isNarrow: boolean;
  onOpenCommandPalette: () => void;
};

const HEADER_SHORTCUT_IDS = ["createNote", "toggleCommandPalette"] as const;

export function SidebarHeader({ store, isNarrow, onOpenCommandPalette }: Props) {
  const shortcutHints = useShortcutHints(store, HEADER_SHORTCUT_IDS);
  const total = useRendererSelector(store, selectNoteTotal);
  return (
    <div
      className={`flex h-11 min-w-0 items-center gap-2 border-b border-sidebar-border ${isNarrow ? "pr-1.5 pl-2.5" : "pr-2 pl-3.5"}`}
    >
      <h2 className="m-0 shrink-0 text-[13px] font-semibold tracking-[-0.005em] text-sidebar-foreground">
        Notes
      </h2>
      {!isNarrow && (
        <span className="min-w-0 truncate text-[11.5px] tabular-nums text-theme-dim">
          {total} {total === 1 ? "note" : "notes"}
        </span>
      )}
      <span className="flex-1" />
      <Tooltip label="Command menu" side="bottom" shortcut={shortcutHints.toggleCommandPalette}>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:bg-sidebar-accent/60 focus-visible:text-foreground focus-visible:shadow-none focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
          aria-label="Command menu"
          onClick={onOpenCommandPalette}
        >
          <CommandIcon size={15} />
        </button>
      </Tooltip>
      <Tooltip label="New note" side="bottom" shortcut={shortcutHints.createNote}>
        <button
          type="button"
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-accent-ink text-accent-ink-foreground transition-[opacity,transform] duration-150 hover:opacity-88 focus-visible:shadow-[0_0_0_2px_hsl(var(--sidebar-background)),0_0_0_3px_hsl(var(--foreground)/0.5)] focus-visible:outline-none active:scale-[0.94] pointer-coarse:h-9 pointer-coarse:w-9"
          aria-label="New note"
          onClick={() => createNote(store, null)}
        >
          <PlusIcon size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
