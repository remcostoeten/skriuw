import { useEffect, useMemo, useState } from "react";
import { journalDayHash, useRouteFocus } from "../app-route";
import { editorModeForNote } from "../actions/editor-mode";
import { NoteEditor } from "../editor/note-editor";
import { RawMarkdownEditor } from "../editor/raw-markdown-editor";
import { hasLosslessMarkdownDocument } from "../editor/schema";
import {
  BarChartIcon,
  CalendarDaysIcon,
  ClockIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "../shared/icons";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import { deleteJournalEntry, ensureJournalEntry, setJournalMood } from "./actions";
import {
  dateKeyOf,
  formatDayHeading,
  formatListDate,
  formatLongDate,
  isDateKey,
  monthOfKey,
  parseDateKey,
  todayKey,
  type DateKey,
  type MonthKey,
} from "./dates";
import { JournalCalendar } from "./journal-calendar";
import {
  MOOD_LEVELS,
  MOOD_OPTIONS,
  journalEntryMood,
  journalNoteIdForDate,
  sameJournalEntries,
  selectJournalEntries,
  type JournalEntry,
  type MoodLevel,
} from "./model";

type Props = {
  store: RendererStore;
};

type SidebarTab = "calendar" | "stats" | "search" | "all";

const SIDEBAR_TABS: readonly { id: SidebarTab; label: string; icon: typeof SearchIcon }[] = [
  { id: "calendar", label: "Calendar", icon: CalendarDaysIcon },
  { id: "stats", label: "Stats", icon: BarChartIcon },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "all", label: "All entries", icon: ClockIcon },
];

function openJournalDay(key: DateKey): void {
  window.location.hash = journalDayHash(key);
}

function entryListTitle(entry: JournalEntry): string {
  return entry.title === "Untitled" ? "Empty entry" : entry.title;
}

function EntryRow({
  entry,
  selected,
  dense,
}: {
  entry: JournalEntry;
  selected: boolean;
  dense: boolean;
}) {
  const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
  return (
    <button
      type="button"
      onClick={() => openJournalDay(entry.dateKey)}
      className={`flex w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-left transition-colors ${
        dense ? "py-1.5" : "py-2"
      } ${selected ? "border-border bg-muted text-foreground" : "hover:border-border hover:bg-muted"}`}
    >
      <span className="w-[86px] shrink-0 text-[10px] font-medium text-muted-foreground">
        {formatListDate(entry.dateKey)}
      </span>
      {mood && <span className={`text-[10px] ${mood.colorClass}`}>{mood.icon}</span>}
      <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
        {entryListTitle(entry)}
      </span>
    </button>
  );
}

/** Run of consecutive entry days ending today, or yesterday when today is unwritten. */
export function currentStreak(
  entryDates: ReadonlySet<DateKey>,
  today: DateKey = todayKey(),
): number {
  const cursor = parseDateKey(today);
  if (!entryDates.has(dateKeyOf(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (entryDates.has(dateKeyOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function JournalStats({ entries }: { entries: readonly JournalEntry[] }) {
  const totalWords = entries.reduce((sum, entry) => sum + entry.wordCount, 0);
  const entryDates = new Set(entries.map((entry) => entry.dateKey));
  const streak = currentStreak(entryDates);
  const moodCounts = new Map<MoodLevel, number>();
  for (const entry of entries) {
    if (entry.mood) {
      moodCounts.set(entry.mood, (moodCounts.get(entry.mood) ?? 0) + 1);
    }
  }
  const tiles: { label: string; value: string }[] = [
    { label: "Entries", value: `${entries.length}` },
    { label: "Words", value: `${totalWords}` },
    { label: "Streak", value: streak === 1 ? "1 day" : `${streak} days` },
    { label: "This month", value: `${entries.filter((entry) => entry.dateKey.startsWith(todayKey().slice(0, 7))).length}` },
  ];
  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-md border border-border/60 bg-card/40 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50">
              {tile.label}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-foreground">{tile.value}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
          Moods
        </p>
        <div className="space-y-1">
          {MOOD_LEVELS.map((level) => {
            const mood = MOOD_OPTIONS[level];
            const count = moodCounts.get(level) ?? 0;
            return (
              <div key={level} className="flex items-center gap-2 px-1 text-[11px]">
                <span className={`w-5 ${mood.colorClass}`}>{mood.icon}</span>
                <span className="flex-1 text-foreground/70">{mood.label}</span>
                <span className="text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JournalSidebar({
  store,
  selectedKey,
}: {
  store: RendererStore;
  selectedKey: DateKey;
}) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const [month, setMonth] = useState<MonthKey>(() => monthOfKey(selectedKey));
  const [tab, setTab] = useState<SidebarTab>("calendar");
  const [query, setQuery] = useState("");
  useEffect(() => {
    setMonth(monthOfKey(selectedKey));
  }, [selectedKey]);
  const entryDates = useMemo(
    () => new Set(entries.map((entry) => entry.dateKey)),
    [entries],
  );
  const monthEntries = useMemo(() => {
    const prefix = `${month.year}-${`${month.month + 1}`.padStart(2, "0")}`;
    return entries.filter((entry) => entry.dateKey.startsWith(prefix));
  }, [entries, month]);
  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return entries;
    }
    const documents = store.getState().documents;
    return entries.filter((entry) => {
      const markdown = documents.get(entry.noteId)?.markdown ?? "";
      return (
        entry.title.toLowerCase().includes(trimmed) ||
        markdown.toLowerCase().includes(trimmed)
      );
    });
  }, [entries, query, store]);

  function goToToday(): void {
    setMonth(monthOfKey(todayKey()));
    openJournalDay(todayKey());
  }

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <h2 className="text-sm font-semibold text-foreground">Journal</h2>
        <button
          type="button"
          onClick={goToToday}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-sidebar-foreground/58 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          <CalendarDaysIcon size={12} />
          Today
        </button>
      </div>
      <div
        role="tablist"
        aria-label="Journal sidebar views"
        className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
      >
        {SIDEBAR_TABS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            onClick={() => setTab(entry.id)}
            role="tab"
            aria-selected={tab === entry.id}
            aria-label={entry.label}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === entry.id
                ? "border border-border bg-muted text-foreground/80"
                : "text-muted-foreground hover:bg-muted hover:text-foreground/75"
            }`}
          >
            <entry.icon size={14} />
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "calendar" && (
          <div className="p-2">
            <JournalCalendar
              month={month}
              selected={selectedKey}
              entryDates={entryDates}
              onSelectDay={openJournalDay}
              onMonthChange={setMonth}
            />
            {monthEntries.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
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
        {tab === "stats" && <JournalStats entries={entries} />}
        {tab === "search" && (
          <div className="p-2">
            <div className="relative mb-2">
              <SearchIcon
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
              />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search entries..."
                aria-label="Search journal entries"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2.5 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:bg-muted"
              />
            </div>
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
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
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          <PlusIcon size={12} />
          New entry
        </button>
      </div>
    </aside>
  );
}

function MoodSelector({
  mood,
  onSelect,
}: {
  mood: MoodLevel | null;
  onSelect: (mood: MoodLevel) => void;
}) {
  return (
    <div className="mt-6 grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-center">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/42">
        Mood
      </span>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Mood">
        {MOOD_LEVELS.map((level) => {
          const option = MOOD_OPTIONS[level];
          const active = mood === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(level)}
              className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${
                active
                  ? "border-border bg-muted font-medium text-foreground"
                  : "border-transparent text-muted-foreground/54 hover:border-border hover:bg-muted/70 hover:text-muted-foreground"
              }`}
              aria-label={option.label}
            >
              <span className={`text-[13px] ${active ? option.colorClass : ""}`}>
                {option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JournalEntryPane({
  store,
  selectedKey,
}: {
  store: RendererStore;
  selectedKey: DateKey;
}) {
  useEffect(() => {
    ensureJournalEntry(store, selectedKey);
  }, [selectedKey, store]);
  const selectNoteId = useMemo(
    () => (state: RendererState) => journalNoteIdForDate(state, selectedKey),
    [selectedKey],
  );
  const selectRawMode = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      if (noteId === null) {
        return false;
      }
      return (
        editorModeForNote(state, noteId) === "raw" ||
        hasLosslessMarkdownDocument(state.documents.get(noteId)?.documentJson)
      );
    },
    [selectNoteId],
  );
  const selectMood = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId === null ? null : journalEntryMood(state, noteId);
    },
    [selectNoteId],
  );
  const selectWordCount = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId === null ? 0 : (state.metadata.get(noteId)?.wordCount ?? 0);
    },
    [selectNoteId],
  );
  const noteId = useRendererSelector(store, selectNoteId);
  const isRawMode = useRendererSelector(store, selectRawMode);
  const mood = useRendererSelector(store, selectMood);
  const wordCount = useRendererSelector(store, selectWordCount);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => setConfirmingDelete(false), [selectedKey]);

  function toggleMood(level: MoodLevel): void {
    if (noteId === null) {
      return;
    }
    setJournalMood(store, noteId, mood === level ? null : level);
  }

  const hasSubstance = wordCount > 0 || mood !== null;

  return (
    <div className="editor-scroll h-full min-w-0 overflow-y-auto bg-theme-editor px-12 py-8">
      <div className="mx-auto flex min-h-full w-full max-w-[72ch] flex-col">
        <header className="border-b border-border/55 pb-5">
          <h1 className="text-[34px] font-semibold leading-none tracking-tight text-foreground">
            {formatDayHeading(selectedKey)}
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground/62">
            {formatLongDate(selectedKey)}
          </p>
          <MoodSelector mood={mood} onSelect={toggleMood} />
        </header>
        <div className="min-h-[320px] flex-1 py-6">
          {noteId !== null &&
            (isRawMode ? (
              <RawMarkdownEditor store={store} selectNoteId={selectNoteId} />
            ) : (
              <NoteEditor store={store} selectNoteId={selectNoteId} />
            ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/55 py-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground/40">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            {wordCount > 0 && (
              <span className="text-[11px] text-muted-foreground/30">auto-saved</span>
            )}
          </div>
          {noteId !== null && hasSubstance && (
            <div>
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-destructive/70">Delete this entry?</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteJournalEntry(store, noteId);
                      setConfirmingDelete(false);
                    }}
                    className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-muted-foreground/40 transition-colors hover:border-border hover:bg-muted hover:text-destructive"
                >
                  <Trash2Icon size={12} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function JournalView({ store }: Props) {
  const focus = useRouteFocus();
  const selectedKey = focus !== null && isDateKey(focus) ? focus : todayKey();
  return (
    <div className="col-[2/-1] flex min-h-0 min-w-0" aria-label="Journal">
      <JournalSidebar store={store} selectedKey={selectedKey} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          data-tauri-drag-region
          className="flex h-11 shrink-0 items-center border-b border-sidebar-border bg-sidebar px-3 pr-[calc(var(--window-controls-width,112px)+8px)] text-sidebar-foreground"
        >
          <div className="pointer-events-none flex flex-1 items-center justify-center gap-3 text-sm">
            <span className="text-sidebar-foreground/58">Journal</span>
            <span className="max-w-[28rem] truncate font-medium text-sidebar-foreground/80">
              {formatLongDate(selectedKey)}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <JournalEntryPane store={store} selectedKey={selectedKey} />
        </div>
      </main>
    </div>
  );
}
