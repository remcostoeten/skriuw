import { CloseIcon, SearchIcon } from "@/shared/icons/static";
import type { SidebarSearch } from "./state";

type Props = {
  search: SidebarSearch;
};

export function SearchField({ search }: Props) {
  return (
    <div ref={search.fieldRef} className="shrink-0 px-2 pt-2.5 pb-1" onBlur={search.onAreaBlur}>
      <label className="flex h-[30px] items-center gap-2 rounded-[7px] border border-sidebar-border bg-foreground/[0.025] pr-1 pl-2.5 transition-colors duration-150 focus-within:border-foreground/20 focus-within:bg-foreground/[0.05] pointer-coarse:h-10">
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
          className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-theme-dim focus-visible:shadow-none"
        />
        {search.query !== "" && (
          <button
            type="button"
            onClick={() => search.clear(true)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-theme-dim transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:bg-sidebar-accent/60 focus-visible:text-foreground focus-visible:shadow-none focus-visible:outline-none"
            aria-label="Clear search"
          >
            <CloseIcon size={13} />
          </button>
        )}
      </label>
    </div>
  );
}
