import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  BarChartIcon,
  CalendarDaysIcon,
  ClockIcon,
  HashIcon,
  PlusIcon,
  SearchIcon,
} from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { monthOfKey, todayKey, type MonthKey } from "@skriuw/renderer-core/journal/dates";
import { JournalCalendar } from "./calendar/month-calendar";
import { JournalStats } from "./history/stats-panel";
import { sameJournalEntries, selectJournalEntries } from "./model";
import { onJournalSearchFocus, openJournalDay, openJournalToday } from "./navigation";
import { useSelectedJournalKey } from "./navigation/selected-day";
import { EntryRow } from "./sidebar/entry-row";
import { JournalTags } from "./tags/panel";
import { projectJournalTags, tagIdsMatchingQuery } from "./tags/projection";
import { selectWordGoalHistory, wordGoalStats } from "./word-goal";

type Props = {
  store: RendererStore;
};

type SidebarTab = "calendar" | "stats" | "tags" | "search" | "all";

const SIDEBAR_TABS: readonly { id: SidebarTab; label: string; icon: typeof SearchIcon }[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDaysIcon },
  { id: "stats", label: "Stats", icon: BarChartIcon },
  { id: "tags", label: "Tags", icon: HashIcon },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "all", label: "All entries", icon: ClockIcon },
];

const TAB_KEY_STEPS: Record<string, number | "first" | "last" | undefined> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  Home: "first",
  End: "last",
};

/** Home/End sit behind a Fn layer on a 60% keyboard, so shift+arrow stands in. */
const SHIFT_TAB_KEY_STEPS: Record<string, "first" | "last" | undefined> = {
  ArrowLeft: "first",
  ArrowRight: "last",
};

function tabButtonId(tab: SidebarTab): string {
  return `journal-tab-${tab}`;
}

function tabPanelId(tab: SidebarTab): string {
  return `journal-panel-${tab}`;
}

function registerTab(
  refs: Map<SidebarTab, HTMLButtonElement>,
  tab: SidebarTab,
  node: HTMLButtonElement | null,
): void {
  if (node === null) {
    refs.delete(tab);
    return;
  }
  refs.set(tab, node);
}

function selectTagRecords(state: RendererState) {
  return state.tags;
}

export function JournalSidebar({ store }: Props) {
  const selectedKey = useSelectedJournalKey();
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const tagRecords = useRendererSelector(store, selectTagRecords);
  const goalHistory = useRendererSelector(store, selectWordGoalHistory);
  const [month, setMonth] = useState<MonthKey>(() => monthOfKey(selectedKey));
  const [tab, setTab] = useState<SidebarTab>("calendar");
  const [query, setQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [pendingSearchFocus, setPendingSearchFocus] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef(new Map<SidebarTab, HTMLButtonElement>());
  useEffect(() => {
    setMonth(monthOfKey(selectedKey));
  }, [selectedKey]);
  useEffect(
    () =>
      onJournalSearchFocus(() => {
        setTab("search");
        setPendingSearchFocus(true);
      }),
    [],
  );
  useEffect(() => {
    if (!pendingSearchFocus || tab !== "search") {
      return;
    }
    setPendingSearchFocus(false);
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [pendingSearchFocus, tab]);
  const entryDates = useMemo(() => new Set(entries.map((entry) => entry.dateKey)), [entries]);
  const monthEntries = useMemo(() => {
    const prefix = `${month.year}-${`${month.month + 1}`.padStart(2, "0")}`;
    return entries.filter((entry) => entry.dateKey.startsWith(prefix));
  }, [entries, month]);
  const tags = useMemo(() => projectJournalTags(tagRecords, entries), [entries, tagRecords]);
  const goalStats = useMemo(
    () => (goalHistory.length === 0 ? null : wordGoalStats(entries, goalHistory, todayKey())),
    [entries, goalHistory],
  );
  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return entries;
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

  function selectTab(next: SidebarTab): void {
    setTab(next);
    tabRefs.current.get(next)?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey
      ? (SHIFT_TAB_KEY_STEPS[event.key] ?? TAB_KEY_STEPS[event.key])
      : TAB_KEY_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const focused = SIDEBAR_TABS.findIndex(
      (entry) => tabRefs.current.get(entry.id) === document.activeElement,
    );
    const current = focused === -1 ? SIDEBAR_TABS.findIndex((entry) => entry.id === tab) : focused;
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? SIDEBAR_TABS.length - 1
          : (current + step + SIDEBAR_TABS.length) % SIDEBAR_TABS.length;
    selectTab(SIDEBAR_TABS[next]!.id);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    if (query.length > 0) {
      setQuery("");
      return;
    }
    event.currentTarget.blur();
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
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-sidebar-foreground/58 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:outline-none"
        >
          <CalendarDaysIcon size={12} aria-hidden="true" />
          Today
        </button>
      </div>
      {/*
        Every tab is a tab stop rather than the APG roving-tabindex single stop:
        five icon-only buttons with no visible labels are undiscoverable when
        only the selected one can be reached. Arrow keys still move and activate.
      */}
      <div
        role="tablist"
        aria-label="Journal sidebar views"
        onKeyDown={handleTabKeyDown}
        className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
      >
        {SIDEBAR_TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            ref={(node) => registerTab(tabRefs.current, entry.id, node)}
            onClick={() => setTab(entry.id)}
            role="tab"
            id={tabButtonId(entry.id)}
            aria-controls={tabPanelId(entry.id)}
            aria-selected={tab === entry.id}
            aria-label={entry.label}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none ${
              tab === entry.id
                ? "border border-border bg-muted text-foreground/80"
                : "text-muted-foreground hover:bg-muted hover:text-foreground/75"
            }`}
          >
            <entry.icon size={14} />
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={tabPanelId(tab)}
        aria-labelledby={tabButtonId(tab)}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none"
      >
        {tab === "calendar" && (
          <div className="p-2">
            <JournalCalendar
              month={month}
              selected={selectedKey}
              entryDates={entryDates}
              goalDates={goalStats?.metDates}
              onSelectDay={openJournalDay}
              onMonthChange={setMonth}
            />
            {monthEntries.length > 0 && (
              <div className="mt-3">
                <p className={cn("mb-1.5", sectionLabelClass)}>
                  This month ({monthEntries.length})
                </p>
                <div className="space-y-0.5">
                  {monthEntries.map((entry) => (
                    <EntryRow
                      key={entry.noteId}
                      entry={entry}
                      selected={entry.dateKey === selectedKey}
                      dense
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === "stats" && <JournalStats entries={entries} goalStats={goalStats} />}
        {tab === "tags" && (
          <JournalTags
            tags={tags}
            entries={entries}
            selectedTagId={selectedTagId}
            selectedKey={selectedKey}
            onSelectTag={setSelectedTagId}
          />
        )}
        {tab === "search" && (
          <div className="p-2">
            <div className="relative mb-2">
              <SearchIcon
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
              />
              <input
                type="text"
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search entries..."
                aria-label="Search journal entries"
                aria-describedby="journal-search-hint"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2.5 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:bg-muted"
              />
            </div>
            <p id="journal-search-hint" className="sr-only">
              Escape clears the search, then leaves the field.
            </p>
            <p role="status" className={cn("mb-1.5", sectionLabelClass)}>
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
        )}
        {tab === "all" && (
          <div className="p-2">
            <div className="space-y-0.5">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.noteId}
                  entry={entry}
                  selected={entry.dateKey === selectedKey}
                  dense={false}
                />
              ))}
            </div>
          </div>
        )}
      </div>
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
}
