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
            <span className="font-medium text-sidebar-foreground/80 max-w-[28rem] truncate">
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

      <div className="mx-auto w-full max-w-[900px] px-8 md:px-16">
        <div className="mt-4 flex items-center gap-2 border-b border-border pb-0">
          <div className="flex items-center gap-0.5">
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

          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                triggerNativeFeedback(showSearch ? "dismiss" : "selection");
                setShowSearch(!showSearch);
              }}
              className={cn(
                "pressable flex h-7 w-7 items-center justify-center rounded-xl transition-colors",
                showSearch
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/50 hover:bg-accent/50 hover:text-foreground",
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
              className="pressable flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
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
              className="pressable ml-1 flex h-7 items-center gap-1.5 rounded-xl bg-indigo-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-600"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              New
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="relative mt-2 mb-1">
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
              className="w-full rounded-md border border-border/60 bg-accent/20 py-1.5 pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-border focus:bg-accent/30"
            />
          </div>
        )}
      </div>

      {/* Entry list */}
      <div
        ref={listRef}
        className="mx-auto w-full max-w-[900px] flex-1 overflow-y-auto px-8 md:px-16"
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
                {searchQuery ? "Try a different search term." : 'Click "New" to start writing.'}
              </p>
            </div>
          ) : (
            <div>
              <div className="relative" style={{ height: totalHeight }}>
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

              {/* New page row */}
              <button
                onClick={onNewEntry}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="text-[14px]">New page</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
