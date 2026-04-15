"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ChevronLeft,
  Plus,
  Filter,
  Search,
  CalendarDays,
  Settings2,
  Sidebar,
  Sparkles,
  SortAsc,
  SortDesc,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { useJournalStore } from "@/features/journal/store";
import { type MoodLevel, MOOD_OPTIONS } from "@/features/journal/types";

type JournalDatabaseViewProps = {
  onSelectEntry: (dateKey: string) => void;
  onNewEntry: () => void;
  onToggleSidebar: () => void;
  onGoToToday: () => void;
  onGoToNotes: () => void;
  onOpenSettings: () => void;
  isMobile: boolean;
};

const JOURNAL_ROW_HEIGHT = 54;
const JOURNAL_OVERSCAN = 8;

const MOOD_TAG_COLORS: Record<MoodLevel, { bg: string; text: string }> = {
  great: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  good: { bg: "bg-green-500/15", text: "text-green-400" },
  neutral: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
  low: { bg: "bg-amber-500/15", text: "text-amber-400" },
  rough: { bg: "bg-red-500/15", text: "text-red-400" },
};

type FilterTab = "all" | "daily" | "tagged" | "moods";
type SortOrder = "newest" | "oldest";

export function JournalDatabaseView({
  onSelectEntry,
  onNewEntry,
  onToggleSidebar,
  onGoToToday,
  onGoToNotes,
  onOpenSettings,
  isMobile,
}: JournalDatabaseViewProps) {
  const store = useJournalStore();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [showSearch, setShowSearch] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const allTags = store.getAllTags();
  const entries = store.config.entries;

  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    // Tab filters
    if (activeTab === "tagged") {
      filtered = filtered.filter((e) => e.tags.length > 0);
    } else if (activeTab === "moods") {
      filtered = filtered.filter((e) => e.mood);
    } else if (activeTab === "daily") {
      // Show entries that have content (not just mood/tags)
      filtered = filtered.filter((e) => e.content.trim().length > 0);
    }

    // Search
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.content.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort
    filtered.sort((a, b) =>
      sortOrder === "newest"
        ? b.dateKey.localeCompare(a.dateKey)
        : a.dateKey.localeCompare(b.dateKey),
    );

    return filtered;
  }, [entries, activeTab, deferredSearchQuery, sortOrder]);

  const getEntryTitle = (entry: (typeof entries)[0]): string => {
    const firstLine = entry.content.split("\n")[0]?.trim();
    if (firstLine) {
      // Strip markdown and @ mentions for clean title
      return (
        firstLine
          .replace(/^#+\s*/, "")
          .replace(/@\w+/g, "")
          .trim()
          .slice(0, 60) || "Untitled"
      );
    }
    return "Untitled";
  };

  const getTagColor = (name: string) => {
    const tag = allTags.find((t) => t.name === name);
    return tag?.color ?? "#6366f1";
  };

  const highlightedCount = entries.filter((entry) => entry.tags.length > 0 || entry.mood).length;
  const writtenCount = entries.filter((entry) => entry.content.trim().length > 0).length;
  const latestEntry = filteredEntries[0] ?? null;

  const tabs: { id: FilterTab; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "All entries", icon: Sparkles },
    { id: "daily", label: "Daily entries", icon: CalendarDays },
    { id: "tagged", label: "Tagged", icon: Filter },
    { id: "moods", label: "With mood", icon: Sparkles },
  ];

  const totalHeight = filteredEntries.length * JOURNAL_ROW_HEIGHT;
  const viewportHeight = listRef.current?.clientHeight ?? 0;
  const visibleCount = Math.ceil(viewportHeight / JOURNAL_ROW_HEIGHT) + JOURNAL_OVERSCAN * 2;
  const startIndex = Math.max(0, Math.floor(scrollTop / JOURNAL_ROW_HEIGHT) - JOURNAL_OVERSCAN);
  const endIndex = Math.min(filteredEntries.length, startIndex + visibleCount);
  const visibleEntries = filteredEntries.slice(startIndex, endIndex);

  if (isMobile) {
    const mobileControlClass =
      "flex h-11 w-11 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:scale-[0.97]";

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-3 pb-3 pt-[max(env(safe-area-inset-top),0.85rem)] sm:px-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-11 items-center gap-1 border border-border bg-background px-1">
              <button onClick={onToggleSidebar} className={mobileControlClass} title="Open journal">
                <Sidebar className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
              <button onClick={onGoToNotes} className={mobileControlClass} title="Go to notes">
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
              <button onClick={onGoToToday} className={mobileControlClass} title="Go to today">
                <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
            </div>

            <div className="flex h-11 min-w-0 flex-1 items-center border border-border bg-background px-4">
              <div className="min-w-0">
                <div className="truncate text-[10px] text-muted-foreground/70">Journal</div>
                <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                  Entries
                </div>
              </div>
            </div>

            <div className="flex h-11 items-center gap-1.5 sm:gap-2">
              <button
                onClick={onNewEntry}
                className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
                title="New entry"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
              <button
                onClick={onOpenSettings}
                className="flex h-11 w-11 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
                title="Open settings"
              >
                <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.7} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  triggerNativeFeedback("selection");
                  setActiveTab(tab.id);
                }}
                className={cn(
                  "pressable flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground/60 hover:border-border hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <tab.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => {
                triggerNativeFeedback(showSearch ? "dismiss" : "selection");
                setShowSearch(!showSearch);
              }}
              className={cn(
                "pressable ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                showSearch
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground/60 hover:border-border hover:bg-muted/60 hover:text-foreground",
              )}
              title="Search"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => {
                triggerNativeFeedback("selection");
                setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
              }}
              className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground"
              title={sortOrder === "newest" ? "Sort oldest first" : "Sort newest first"}
            >
              {sortOrder === "newest" ? (
                <SortDesc className="h-3.5 w-3.5" strokeWidth={1.5} />
              ) : (
                <SortAsc className="h-3.5 w-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
          {showSearch && (
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter entries..."
                autoFocus
                className="w-full rounded-md border border-border/60 bg-accent/20 py-2 pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-border focus:bg-accent/30"
              />
            </div>
          )}
        </div>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div className="mt-2">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 text-[40px]">📝</div>
                <p className="text-[14px] text-muted-foreground/60">
                  {searchQuery ? "No entries match your search." : "No entries yet."}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground/40">
                  {searchQuery ? "Try a different search term." : 'Tap "+" to start writing.'}
                </p>
              </div>
            ) : (
              <div>
                <div className="relative" style={{ height: totalHeight }}>
                  {visibleEntries.map((entry, visibleIndex) => {
                    const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                    const entryDate = new Date(entry.dateKey + "T00:00:00");
                    const title = getEntryTitle(entry);
                    const rowIndex = startIndex + visibleIndex;

                    return (
                      <button
                        key={entry.id}
                        onClick={() => {
                          triggerNativeFeedback("selection");
                          onSelectEntry(entry.dateKey);
                        }}
                        className="pressable-soft group absolute left-0 flex w-full items-center gap-3 border-b border-border px-1 py-2.5 text-left transition-colors hover:bg-muted"
                        style={{
                          top: rowIndex * JOURNAL_ROW_HEIGHT,
                          height: JOURNAL_ROW_HEIGHT,
                        }}
                      >
                        <span className="w-5 shrink-0 text-center text-[14px]">
                          {mood ? (
                            <span className={mood.color}>{mood.icon}</span>
                          ) : (
                            <span className="text-muted-foreground/20">·</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] text-foreground/80 group-hover:text-foreground">
                          {title}
                        </span>
                        <span className="shrink-0 text-[12px] text-muted-foreground/40">
                          {format(entryDate, "MMM d")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={onNewEntry}
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                >
                  <span className="w-5 shrink-0 text-center text-[14px]">+</span>
                  <span className="text-[14px]">New entry</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-sidebar-border border-l bg-sidebar text-sidebar-foreground">
        <div className="flex h-11 items-center px-3">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleSidebar}
              className="pressable flex h-7 w-7 items-center justify-center border border-transparent text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title="Toggle sidebar"
            >
              <Sidebar className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={onGoToNotes}
              className="pressable flex h-7 w-7 items-center justify-center border border-transparent text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title="Go to notes"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={onGoToToday}
              className="pressable flex h-7 w-7 items-center justify-center border border-transparent text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title="Go to today"
            >
              <CalendarDays className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center gap-3 text-sm">
            <span className="text-sidebar-foreground/58">Journal</span>
            <span className="max-w-[28rem] truncate font-medium text-sidebar-foreground/80">
              Entries
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                triggerNativeFeedback(showSearch ? "dismiss" : "selection");
                setShowSearch(!showSearch);
              }}
              className={cn(
                "pressable flex h-7 w-7 items-center justify-center border border-transparent transition-colors duration-200",
                showSearch
                  ? "border-sidebar-border bg-sidebar-accent/70 text-sidebar-foreground"
                  : "text-sidebar-foreground/58 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
              title="Search"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => {
                triggerNativeFeedback("selection");
                setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
              }}
              className="pressable flex h-7 w-7 items-center justify-center border border-transparent text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title={sortOrder === "newest" ? "Sort oldest first" : "Sort newest first"}
            >
              {sortOrder === "newest" ? (
                <SortDesc className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <SortAsc className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={onNewEntry}
              className="pressable ml-1 flex h-7 items-center gap-1.5 border border-transparent px-2.5 text-[11px] text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title="New entry"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span>New</span>
            </button>
            <button
              onClick={onOpenSettings}
              className="pressable flex h-7 w-7 items-center justify-center border border-transparent text-sidebar-foreground/58 transition-colors duration-200 hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              title="Open settings"
            >
              <Settings2 className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[980px] px-8 md:px-16">
        <div className="mt-6 overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(245,240,232,0.96),rgba(255,252,247,0.92))] shadow-[0_24px_70px_rgba(53,33,17,0.08)]">
          <div className="flex flex-col gap-5 border-b border-border/70 px-6 py-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-[36rem] space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/70">
                Journal Archive
              </p>
              <h2 className="text-[30px] font-semibold tracking-[-0.04em] text-foreground">
                Browse entries like a calm daily ledger.
              </h2>
              <p className="max-w-[32rem] text-[14px] leading-6 text-muted-foreground">
                Filter reflections by mood, tags, and writing depth without leaving the journal shell.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-left md:min-w-[20rem]">
              <div className="rounded-2xl border border-border/70 bg-background/78 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/65">
                  Total
                </div>
                <div className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-foreground">
                  {entries.length}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/78 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/65">
                  Written
                </div>
                <div className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-foreground">
                  {writtenCount}
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/78 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/65">
                  Highlighted
                </div>
                <div className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-foreground">
                  {highlightedCount}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-border/70 px-4 pt-2">
            <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    triggerNativeFeedback("selection");
                    setActiveTab(tab.id);
                  }}
                  className={cn(
                    "pressable flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground/60 hover:text-muted-foreground",
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1 pb-2">
              <button
                onClick={() => {
                  triggerNativeFeedback(showSearch ? "dismiss" : "selection");
                  setShowSearch(!showSearch);
                }}
                className={cn(
                  "pressable flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
                  showSearch
                    ? "border-border bg-background text-foreground"
                    : "border-transparent text-muted-foreground/55 hover:border-border/70 hover:bg-background/75 hover:text-foreground",
                )}
                title="Search"
              >
                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => {
                  triggerNativeFeedback("selection");
                  setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
                }}
                className="pressable flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-muted-foreground/55 transition-colors hover:border-border/70 hover:bg-background/75 hover:text-foreground"
                title={sortOrder === "newest" ? "Sort oldest first" : "Sort newest first"}
              >
                {sortOrder === "newest" ? (
                  <SortDesc className="h-3.5 w-3.5" strokeWidth={1.5} />
                ) : (
                  <SortAsc className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </button>
              <button
                onClick={() => {
                  triggerNativeFeedback("success");
                  onNewEntry();
                }}
                className="pressable ml-1 flex h-8 items-center gap-1.5 rounded-full bg-[#bc5b2c] px-3.5 text-[12px] font-medium text-[#fff7ef] transition-colors hover:bg-[#a94f23]"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                New Entry
              </button>
            </div>
          </div>

          {showSearch && (
            <div className="relative mx-4 mb-4 mt-3">
              <Search
                className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter entries..."
                autoFocus
                className="w-full rounded-2xl border border-border/70 bg-background/82 py-2.5 pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/35 focus:border-border focus:bg-background"
              />
            </div>
          )}

          {latestEntry && (
            <div className="mx-4 mb-4 rounded-2xl border border-dashed border-border/70 bg-background/72 px-4 py-3 text-[12px] text-muted-foreground">
              Latest visible entry:
              <span className="ml-1 font-medium text-foreground">{getEntryTitle(latestEntry)}</span>
              <span className="ml-2 text-muted-foreground/70">
                {format(new Date(latestEntry.dateKey + "T00:00:00"), "MMMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        ref={listRef}
        className="mx-auto w-full max-w-[980px] flex-1 overflow-y-auto px-8 md:px-16"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="mt-5">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/78 py-20 text-center shadow-[0_18px_44px_rgba(53,33,17,0.05)]">
              <div className="mb-4 rounded-full border border-border/70 bg-accent/30 px-4 py-2 text-[22px]">
                📝
              </div>
              <p className="text-[14px] text-muted-foreground/60">
                {searchQuery ? "No entries match your search." : "No entries yet."}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground/40">
                {searchQuery ? "Try a different search term." : 'Click "New" to start writing.'}
              </p>
            </div>
          ) : (
            <div>
              <div
                className="relative overflow-hidden rounded-[24px] border border-border/70 bg-background/84 shadow-[0_22px_50px_rgba(53,33,17,0.06)]"
                style={{ height: totalHeight }}
              >
                {visibleEntries.map((entry, visibleIndex) => {
                  const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                  const moodColors = entry.mood ? MOOD_TAG_COLORS[entry.mood] : null;
                  const entryDate = new Date(entry.dateKey + "T00:00:00");
                  const title = getEntryTitle(entry);
                  const rowIndex = startIndex + visibleIndex;

                  return (
                    <button
                      key={entry.id}
                      onClick={() => {
                        triggerNativeFeedback("selection");
                        onSelectEntry(entry.dateKey);
                      }}
                      className="pressable-soft group absolute left-0 flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left transition-colors hover:bg-accent/20"
                      style={{
                        top: rowIndex * JOURNAL_ROW_HEIGHT,
                        height: JOURNAL_ROW_HEIGHT,
                      }}
                    >
                      <span className="w-5 shrink-0 text-center text-[14px]">
                        {mood ? (
                          <span className={mood.color}>{mood.icon}</span>
                        ) : (
                          <span className="text-muted-foreground/20">·</span>
                        )}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-[14px] text-foreground/80 group-hover:text-foreground">
                        {title}
                      </span>

                      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                        {entry.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="border px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: `${getTagColor(tag)}18`,
                              color: getTagColor(tag),
                              borderColor: `${getTagColor(tag)}35`,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {entry.tags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground/40">
                            +{entry.tags.length - 3}
                          </span>
                        )}
                      </div>

                      {mood && moodColors && (
                        <span
                          className={cn(
                            "hidden shrink-0 border px-2 py-0.5 text-[11px] font-medium sm:inline-block",
                            moodColors.bg,
                            moodColors.text,
                          )}
                        >
                          {mood.label}
                        </span>
                      )}

                      <span className="shrink-0 text-[12px] text-muted-foreground/40">
                        {format(entryDate, "MMM d, yyyy h:mm a")}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={onNewEntry}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-3 text-left text-muted-foreground/50 transition-colors hover:border-border hover:bg-background/72 hover:text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="text-[14px]">New entry</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
