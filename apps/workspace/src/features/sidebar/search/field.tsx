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
          ref={search.overlayRef}
          initial={{ y: 8, opacity: 0, scale: 0.985 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 8, opacity: 0, scale: 0.985 }}
          transition={HEADER_SWAP_TRANSITION}
          className="absolute inset-x-0 top-0 flex h-11 items-center px-3 will-change-transform"
          onBlur={search.onAreaBlur}
        >
          <div className="flex h-8 w-full items-center gap-2 bg-transparent px-2.5">
            <SearchIcon size={14} className="shrink-0 text-muted-foreground" />
            <input
              ref={search.inputRef}
              type="text"
              value={search.query}
              onChange={(event) => search.setQuery(event.currentTarget.value)}
              onKeyDown={search.onInputKeyDown}
              placeholder="Search"
              aria-label="Search notes"
              inputMode="search"
              enterKeyHint="search"
              className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 focus-visible:shadow-none"
            />
            <button
              type="button"
              onClick={() => search.close(true)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-none focus-visible:outline-none focus-visible:bg-accent focus-visible:text-foreground"
              aria-label="Close search"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
