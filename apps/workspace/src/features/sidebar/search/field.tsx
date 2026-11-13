import { AnimatePresence, motion } from "motion/react";
import { CloseIcon, SearchIcon } from "@/shared/icons/static";
import { HEADER_SWAP_TRANSITION } from "../header/swap";
import type { SidebarSearch } from "./state";

type Props = {
  search: SidebarSearch;
};

export function SearchField({ search }: Props) {
  return (
    <AnimatePresence>
      {search.isOpen && (
        <motion.div
          ref={search.fieldRef}
          initial={{ y: 8, opacity: 0, scale: 0.985 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.985 }}
          transition={HEADER_SWAP_TRANSITION}
          className="absolute inset-x-0 top-0 flex h-11 items-center gap-2 pr-2 pl-3.5 will-change-transform"
          onBlur={search.onAreaBlur}
        >
          <SearchIcon size={14} className="shrink-0 text-theme-dim" />
          <input
            ref={search.inputRef}
            type="text"
            value={search.query}
            onChange={(event) => search.setQuery(event.currentTarget.value)}
            onKeyDown={search.onInputKeyDown}
            placeholder="Search notes"
            aria-label="Search notes"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-theme-dim focus-visible:shadow-none"
          />
          <button
            type="button"
            onClick={() => search.close(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-theme-dim transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:bg-sidebar-accent/60 focus-visible:text-foreground focus-visible:shadow-none focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label="Close search"
          >
            <CloseIcon size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
