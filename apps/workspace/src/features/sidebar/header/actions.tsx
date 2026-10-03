import { motion } from "motion/react";
import type { RefObject } from "react";
import { useShortcutHints } from "@/commands/hints";
import { AppIcon } from "@/shared/icons/app-icon";
import { CommandIcon, FolderPlusIcon, SearchIcon, UnfoldVerticalIcon } from "@/shared/icons/static";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { createFolder, createNote, toggleAllFolders } from "../tree/operations";
import { HEADER_SWAP_TRANSITION } from "./swap";

type Props = {
  store: RendererStore;
  isNarrow: boolean;
  isSearchOpen: boolean;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
  onOpenCommandPalette: () => void;
};

const HEADER_SHORTCUT_IDS = ["createNote", "createFolder", "toggleCommandPalette"] as const;

const headerActionBaseClass =
  "inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-accent focus-visible:text-foreground";

export function HeaderActions({
  store,
  isNarrow,
  isSearchOpen,
  searchTriggerRef,
  onOpenSearch,
  onOpenCommandPalette,
}: Props) {
  const shortcutHints = useShortcutHints(store, HEADER_SHORTCUT_IDS);
  const headerActionClass = `${headerActionBaseClass} ${isNarrow ? "h-6 w-6" : "h-7 w-7"}`;
  return (
    <motion.div
      animate={isSearchOpen ? { y: -8, opacity: 0, scale: 0.985 } : { y: 0, opacity: 1, scale: 1 }}
      transition={HEADER_SWAP_TRANSITION}
      inert={isSearchOpen}
      aria-hidden={isSearchOpen}
      className={`flex w-full min-w-0 items-center justify-between will-change-transform${isSearchOpen ? " pointer-events-none" : ""}`}
    >
      <Tooltip label="New note" side="bottom" shortcut={shortcutHints.createNote}>
        <button
          type="button"
          className={headerActionClass}
          aria-label="New note"
          onClick={() => createNote(store, null)}
        >
          <AppIcon name="new-note" size={18} />
        </button>
      </Tooltip>
      <Tooltip label="New folder" side="bottom" shortcut={shortcutHints.createFolder}>
        <button
          type="button"
          className={headerActionClass}
          aria-label="New folder"
          onClick={() => createFolder(store, null)}
        >
          <FolderPlusIcon size={18} />
        </button>
      </Tooltip>
      <Tooltip label="Toggle all folders" side="bottom">
        <button
          type="button"
          className={headerActionClass}
          aria-label="Toggle all folders"
          onClick={() => toggleAllFolders(store)}
        >
          <UnfoldVerticalIcon size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Search notes" side="bottom">
        <button
          ref={searchTriggerRef}
          type="button"
          className={headerActionClass}
          aria-label="Search notes"
          onClick={onOpenSearch}
        >
          <SearchIcon size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Command menu" side="bottom" shortcut={shortcutHints.toggleCommandPalette}>
        <button
          type="button"
          className={headerActionClass}
          aria-label="Command menu"
          onClick={onOpenCommandPalette}
        >
          <CommandIcon size={16} />
        </button>
      </Tooltip>
    </motion.div>
  );
}
