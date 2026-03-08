"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  Tag,
  Search,
  X,
  Filter,
  BarChart3,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalStore } from "@/modules/journal";
import { MoodLevel, MOOD_OPTIONS } from "@/types/notes";

const JournalStats = dynamic(
  () => import("./journal-stats").then((mod) => ({ default: mod.JournalStats })),
  {
    ssr: false,
    loading: () => (
      <div className="p-4">
        <div className="text-xs text-muted-foreground">Loading stats…</div>
      </div>
    ),
  },
);

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type JournalSidebarProps = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  className?: string;
};

export function JournalSidebar({ selectedDate, onSelectDate, className }: JournalSidebarProps) {
  const store = useJournalStore();
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
  const [view, setView] = useState<"calendar" | "stats" | "search" | "all" | "tags">("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodLevel | "all">("all");
  const [selectedTag, setSelectedTag] = useState<string | "all">("all");

  const datesWithEntries = store.getDatesWithEntries();
  const entrySet = useMemo(() => new Set(datesWithEntries), [datesWithEntries]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const allEntries = useMemo(() => {
    return [...store.config.entries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [store.config.entries]);

  const filteredEntries = useMemo(() => {
    let filtered = [...store.config.entries];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.content.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    // Mood filter
    if (selectedMood !== "all") {
      filtered = filtered.filter((entry) => entry.mood === selectedMood);
    }

    // Tag filter
    if (selectedTag !== "all") {
      filtered = filtered.filter((entry) => entry.tags.includes(selectedTag));
    }

    return filtered.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [store.config.entries, searchQuery, selectedMood, selectedTag]);

  const entriesForMonth = useMemo(() => {
    const prefix = format(currentMonth, "yyyy-MM");
    return allEntries.filter((e) => e.dateKey.startsWith(prefix));
  }, [allEntries, currentMonth]);

  const allTags = store.getAllTags();

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onSelectDate(today);
  };

  return (
    <div
      className={cn(
        "flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-card/50",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Journal</h2>
        <button
          onClick={goToToday}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Go to today"
        >
          <CalendarDays className="h-3 w-3" strokeWidth={1.5} />
          Today
        </button>
      </div>

      {/* View tabs */}
      <div className="flex items-center border-b border-border/40 px-2 py-1">
        {[
          { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
          { id: "stats" as const, label: "Stats", icon: BarChart3 },
          { id: "search" as const, label: "Search", icon: Search },
          { id: "all" as const, label: "All", icon: Clock },
          { id: "tags" as const, label: "Tags", icon: Tag },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            title={tab.label}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              view === tab.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "calendar" && (
          <div className="p-2">
            {/* Month navigation */}
            <div className="mb-1 flex items-center justify-between">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <span className="text-[11px] font-semibold text-foreground/90">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-0">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = isSameDay(day, selectedDate);
                const hasEntry = entrySet.has(dateKey);
                const dayIsToday = isToday(day);

                return (
                  <button
                    key={dateKey}
                    onClick={() => onSelectDate(day)}
                    className={cn(
                      "relative flex h-7 w-full items-center justify-center rounded-md text-[11px] transition-all",
                      !inCurrentMonth && "text-muted-foreground/25",
                      inCurrentMonth && !isSelected && "text-foreground/70 hover:bg-accent/60",
                      isSelected && "bg-foreground text-background font-semibold shadow-sm",
                      dayIsToday &&
                        !isSelected &&
                        "font-bold text-foreground ring-1 ring-foreground/20",
                    )}
                  >
                    {format(day, "d")}
                    {hasEntry && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-indigo-400" />
                    )}
                    {hasEntry && isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-background/60" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Entries this month */}
            {entriesForMonth.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/50">
                  This month ({entriesForMonth.length})
                </p>
                <div className="space-y-0.5">
                  {entriesForMonth.map((entry) => {
                    const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                    const isActive = entry.dateKey === format(selectedDate, "yyyy-MM-dd");
                    return (
                      <button
                        key={entry.id}
                        onClick={() => {
                          const [y, m, d] = entry.dateKey.split("-").map(Number);
                          onSelectDate(new Date(y, m - 1, d));
                        }}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                          isActive ? "bg-accent text-foreground" : "hover:bg-accent/40",
                        )}
                      >
                        <span className="w-7 shrink-0 text-[10px] font-medium text-muted-foreground">
                          {format(new Date(entry.dateKey + "T00:00:00"), "d MMM")}
                        </span>
                        {mood && <span className={cn("text-[10px]", mood.color)}>{mood.icon}</span>}
                        <span className="flex-1 truncate text-[11px] text-foreground/70">
                          {entry.content.slice(0, 35) || "Empty entry"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {view === "stats" && <JournalStats />}

        {view === "search" && (
          <div className="p-2">
            {/* Search input */}
            <div className="relative mb-2">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50"
                strokeWidth={1.5}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="w-full rounded-lg border border-border/60 bg-accent/20 pl-8 pr-2.5 py-1.5 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-border focus:bg-accent/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-md text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="space-y-2">
              {/* Mood filter */}
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <Filter className="h-2.5 w-2.5 text-muted-foreground/50" strokeWidth={1.5} />
                  <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
                    Mood
                  </span>
                </div>
                <div className="flex flex-wrap gap-0.5">
                  <button
                    onClick={() => setSelectedMood("all")}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[9px] transition-colors",
                      selectedMood === "all"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/40",
                    )}
                  >
                    All
                  </button>
                  {(
                    Object.entries(MOOD_OPTIONS) as [MoodLevel, (typeof MOOD_OPTIONS)[MoodLevel]][]
                  ).map(([key, mood]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedMood(key)}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] transition-colors",
                        selectedMood === key
                          ? cn("bg-accent text-foreground", mood.color)
                          : "text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      {mood.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag filter */}
              {allTags.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <Filter className="h-2.5 w-2.5 text-muted-foreground/50" strokeWidth={1.5} />
                    <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
                      Tag
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    <button
                      onClick={() => setSelectedTag("all")}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] transition-colors",
                        selectedTag === "all"
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      All
                    </button>
                    {allTags.slice(0, 6).map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedTag(tag.name)}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[9px] transition-colors",
                          selectedTag === tag.name
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/40",
                        )}
                      >
                        @{tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            <div className="mt-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">
                {filteredEntries.length} {filteredEntries.length === 1 ? "result" : "results"}
              </p>
              {filteredEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-accent/10 px-3 py-4 text-center">
                  <p className="text-[11px] text-muted-foreground/60">No entries found.</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/40">
                    Try adjusting your search or filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredEntries.map((entry) => {
                    const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                    const isActive = entry.dateKey === format(selectedDate, "yyyy-MM-dd");
                    return (
                      <button
                        key={entry.id}
                        onClick={() => {
                          const [y, m, d] = entry.dateKey.split("-").map(Number);
                          const date = new Date(y, m - 1, d);
                          setCurrentMonth(date);
                          onSelectDate(date);
                          setView("calendar");
                        }}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                          isActive ? "bg-accent text-foreground" : "hover:bg-accent/40",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-medium text-foreground/80">
                              {format(new Date(entry.dateKey + "T00:00:00"), "EEE, MMM d")}
                            </span>
                            {mood && (
                              <span className={cn("text-[10px]", mood.color)}>{mood.icon}</span>
                            )}
                          </div>
                          <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/60">
                            {entry.content.slice(0, 80) || "Empty entry"}
                          </p>
                          {entry.tags.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              {entry.tags.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-accent/80 px-1 py-px text-[8px] text-muted-foreground"
                                >
                                  @{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "all" && (
          <div className="p-3">
            {allEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-accent/10 px-4 py-6 text-center">
                <p className="text-[12px] text-muted-foreground/60">No entries yet.</p>
                <p className="mt-1 text-[11px] text-muted-foreground/40">
                  Select a date to start writing.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {allEntries.map((entry) => {
                  const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                  const isActive = entry.dateKey === format(selectedDate, "yyyy-MM-dd");
                  return (
                    <button
                      key={entry.id}
                      onClick={() => {
                        const [y, m, d] = entry.dateKey.split("-").map(Number);
                        const date = new Date(y, m - 1, d);
                        setCurrentMonth(date);
                        onSelectDate(date);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                        isActive ? "bg-accent text-foreground" : "hover:bg-accent/40",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-foreground/80">
                            {format(new Date(entry.dateKey + "T00:00:00"), "EEE, MMM d yyyy")}
                          </span>
                          {mood && (
                            <span className={cn("text-[11px]", mood.color)}>{mood.icon}</span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
                          {entry.content.slice(0, 120) || "Empty entry"}
                        </p>
                        {entry.tags.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {entry.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-accent/80 px-1.5 py-px text-[9px] text-muted-foreground"
                              >
                                @{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {view === "tags" && (
          <div className="p-3">
            {allTags.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-accent/10 px-4 py-6 text-center">
                <p className="text-[12px] text-muted-foreground/60">No tags yet.</p>
                <p className="mt-1 text-[11px] text-muted-foreground/40">
                  Use @tag in your entries to create tags.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {allTags.map((tag) => {
                  const tagEntries = store.getEntriesByTag(tag.name);
                  return (
                    <div
                      key={tag.id}
                      className="rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-[12px] font-medium text-foreground/80">
                          @{tag.name}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground/50">
                          {tag.usageCount} {tag.usageCount === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      {tagEntries.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 pl-[18px]">
                          {tagEntries.slice(0, 3).map((entry) => (
                            <button
                              key={entry.id}
                              onClick={() => {
                                const [y, m, d] = entry.dateKey.split("-").map(Number);
                                const date = new Date(y, m - 1, d);
                                setCurrentMonth(date);
                                onSelectDate(date);
                                setView("calendar");
                              }}
                              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground/60 transition-colors hover:bg-accent/40 hover:text-muted-foreground"
                            >
                              <span>{format(new Date(entry.dateKey + "T00:00:00"), "MMM d")}</span>
                              <span className="truncate">{entry.content.slice(0, 30)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New entry button */}
      <div className="border-t border-border/60 p-2">
        <button
          onClick={goToToday}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground/[0.07] px-2 py-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.12]"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          New entry
        </button>
      </div>
    </div>
  );
}
