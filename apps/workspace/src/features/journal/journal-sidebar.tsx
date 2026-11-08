import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CalendarDaysIcon, PlusIcon, SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { monthOfKey, todayKey, type MonthKey } from "@skriuw/renderer-core/journal/dates";
import { JournalCalendar } from "./calendar/month-calendar";
import { sameJournalEntries, selectJournalEntries } from "./model";
import { JournalOutline } from "./journal-outline";
import { onJournalSearchFocus, openJournalDay, openJournalToday } from "./navigation";
import { useSelectedJournalKey } from "./navigation/selected-day";
import { EntryRow } from "./sidebar/entry-row";
import { projectJournalTags, tagIdsMatchingQuery } from "./tags/projection";
import { selectWordGoalHistory, wordGoalStats } from "./word-goal";

type Props = {
  store: RendererStore;
};

function selectTagRecords(state: RendererState) {
  return state.tags;
}

export const JournalSidebar = memo(function JournalSidebar({ store }: Props) {
  const selectedKey = useSelectedJournalKey();
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const tagRecords = useRendererSelector(store, selectTagRecords);
  const goalHistory = useRendererSelector(store, selectWordGoalHistory);
  const [month, setMonth] = useState<MonthKey>(() => monthOfKey(selectedKey));
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setMonth(monthOfKey(selectedKey));
  }, [selectedKey]);
  useEffect(
    () =>
      onJournalSearchFocus(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }),
    [],
  );
  const entryDates = useMemo(() => new Set(entries.map((entry) => entry.dateKey)), [entries]);
  const tags = useMemo(() => projectJournalTags(tagRecords, entries), [entries, tagRecords]);
  const goalStats = useMemo(
    () => (goalHistory.length === 0 ? null : wordGoalStats(entries, goalHistory, todayKey())),
    [entries, goalHistory],
  );
  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    const documents = store.getState().documents;
    const matchedTagIds = tagIdsMatchingQuery(tags, trimmed);
    return entries.filter((entry) => {
      const markdown = documents.get(entry.noteId)?.markdown ?? "";
      return (
        entry.title.toLowerCase().includes(trimmed) ||
        markdown.toLowerCase().includes(trimmed) ||
        entry.tagIds.some((tagId) => matchedTagIds.has(tagId))
      );
    });
  }, [entries, query, store, tags]);

  function goToToday(): void {
    setMonth(monthOfKey(todayKey()));
    openJournalToday();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.length > 0) {
        setQuery("");
        return;
      }
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowDown" && searching) {
      const first = resultsRef.current?.querySelector<HTMLButtonElement>("button");
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
    if (event.key === "Enter" && searchResults[0] !== undefined) {
      event.preventDefault();
      openJournalDay(searchResults[0].dateKey);
    }
  }

  function handleResultsKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) {
      return;
    }
    event.preventDefault();
    if (index === 0 && event.key === "ArrowUp") {
      searchInputRef.current?.focus();
      return;
    }
    items[Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
  }

  return (
    <aside
      aria-label="Journal entries"
      className="flex h-full min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <h2 className="text-sm font-semibold text-foreground">Journal</h2>
        <button
          type="button"
          onClick={goToToday}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-xs font-medium text-sidebar-foreground/58 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none"
        >
          <CalendarDaysIcon size={12} aria-hidden="true" />
          Today
        </button>
      </div>
      <div className="shrink-0 px-2.5 pt-3 pb-3">
        <div className="relative">
          <SearchIcon
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-theme-secondary"
          />
          <input
            type="text"
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search entries"
            aria-label="Search journal entries"
            aria-describedby="journal-search-hint"
            className="h-8 w-full rounded-lg border border-border bg-background py-0 pl-[29px] pr-3 text-[12.5px] text-foreground outline-none transition-colors duration-150 placeholder:text-theme-dim hover:border-theme-btn-outline focus-visible:border-ring pointer-coarse:h-11"
          />
        </div>
        <p id="journal-search-hint" className="sr-only">
          Escape clears the search, then leaves the field. Arrow down moves to the results.
        </p>
      </div>
      {searching ? (
        <div
          ref={resultsRef}
          onKeyDown={handleResultsKeyDown}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        >
          <p role="status" className="px-2 pb-1.5 text-[11px] text-theme-dim">
            {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
          </p>
          <div className="space-y-0.5">
            {searchResults.map((entry) => (
              <EntryRow
                key={entry.noteId}
                entry={entry}
                selected={entry.dateKey === selectedKey}
                dense
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-2.5 pb-3")}>
          <JournalCalendar
            month={month}
            selected={selectedKey}
            entryDates={entryDates}
            goalDates={goalStats?.metDates}
            onSelectDay={openJournalDay}
            onMonthChange={setMonth}
          />
          <p className="mb-1.5 mt-4 px-[9px] text-[11px] text-theme-dim">On this page</p>
          <JournalOutline />
        </div>
      )}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={goToToday}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none"
        >
          <PlusIcon size={12} aria-hidden="true" />
          New entry
        </button>
      </div>
    </aside>
  );
});
