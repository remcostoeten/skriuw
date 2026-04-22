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
import { type MoodLevel, type DateKey, MOOD_OPTIONS } from "@/features/journal/types";
import { useJournalEntries, useJournalTags } from "../hooks/use-journal-hooks";

const JournalStats = dynamic(
  () => import("./journal-stats").then((mod) => ({ default: mod.JournalStats })),
  {
    ssr: false,
    loading: () => null,
  },
);

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type JournalSidebarProps = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  className?: string;
};

export function JournalSidebar({ selectedDate, onSelectDate, className }: JournalSidebarProps) {
  const { data: entries = [] } = useJournalEntries();
  const { data: allTags = [] } = useJournalTags();
  
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
  const [view, setView] = useState<"calendar" | "stats" | "search" | "all" | "tags">("calendar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMood, setSelectedMood] = useState<MoodLevel | "all">("all");
  const [selectedTag, setSelectedTag] = useState<string | "all">("all");

  const datesWithEntries = useMemo(() => entries.map(e => e.dateKey), [entries]);
  const entrySet = useMemo(() => new Set(datesWithEntries), [datesWithEntries]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const allEntriesSorted = useMemo(() => {
    return [...entries].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

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
  }, [entries, searchQuery, selectedMood, selectedTag]);

  const entriesForMonth = useMemo(() => {
    const prefix = format(currentMonth, "yyyy-MM");
    return allEntriesSorted.filter((e) => e.dateKey.startsWith(prefix));
  }, [allEntriesSorted, currentMonth]);

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onSelectDate(today);
  };

  const journalTabs = [
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
    { id: "stats" as const, label: "Stats", icon: BarChart3 },
    { id: "search" as const, label: "Search", icon: Search },
    { id: "all" as const, label: "All entries", icon: Clock },
    { id: "tags" as const, label: "Tags", icon: Tag },
  ];

  return (
    <div
      className={cn(
        "flex h-full w-full shrink-0 flex-col bg-background",
        className,
      )}
    >
      <div className="flex h-11 items-center justify-between border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
        <h2 className="text-sm font-semibold text-foreground">Journal</h2>
        <button
          onClick={goToToday}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-sidebar-foreground/58 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          title="Go to today"
        >
          <CalendarDays className="h-3 w-3" strokeWidth={1.5} />
          Today
        </button>
      </div>

      {/* View tabs */}
      <div
        role="tablist"
        aria-label="Journal sidebar views"
        className="flex h-11 items-center border-b border-border px-2"
      >
        {journalTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            role="tab"
            aria-selected={view === tab.id}
            aria-label={tab.label}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              view === tab.id
                ? "border border-border bg-muted text-foreground/80"
                : "text-muted-foreground hover:bg-muted hover:text-foreground/75",
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
                const dateKey = format(day, "yyyy-MM-dd") as DateKey;
                const inCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = isSameDay(day, selectedDate);
                const hasEntry = entrySet.has(dateKey);
                const dayIsToday = isToday(day);

                return (
                  <button
                    key={dateKey}
                    onClick={() => onSelectDate(day)}
                    className={cn(
                      "relative flex h-7 w-full items-center justify-center border border-transparent text-[11px] transition-colors",
                      !inCurrentMonth && "text-muted-foreground/25",
                      inCurrentMonth && !isSelected && "text-foreground/70 hover:border-border hover:bg-muted",
                      isSelected && "border-border bg-muted text-foreground font-semibold",
                      dayIsToday && !isSelected && "border-border font-bold text-foreground",
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
                          "flex w-full items-center gap-1.5 border border-transparent px-2 py-1.5 text-left transition-colors",
                          isActive ? "border-border bg-muted text-foreground" : "hover:border-border hover:bg-muted",
                        )}
                      >
                        <span className="w-[72px] shrink-0 text-[10px] font-medium text-muted-foreground">
                          {format(new Date(entry.dateKey + "T00:00:00"), "dd MM yyyy")}
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
                className="w-full border border-border bg-background pl-8 pr-2.5 py-1.5 text-[11px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-border focus:bg-muted"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 border border-transparent text-muted-foreground/50 transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="mt-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">
                {filteredEntries.length} {filteredEntries.length === 1 ? "result" : "results"}
              </p>
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
                        "flex w-full items-start gap-2 border border-transparent px-2 py-2 text-left transition-colors",
                        isActive ? "border-border bg-muted text-foreground" : "hover:border-border hover:bg-muted",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-foreground/80">
                            {format(new Date(entry.dateKey + "T00:00:00"), "EEE, dd MM yyyy")}
                          </span>
                          {mood && (
                            <span className={cn("text-[10px]", mood.color)}>{mood.icon}</span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/60">
                          {entry.content.slice(0, 80) || "Empty entry"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {view === "all" && (
          <div className="p-3">
            <div className="space-y-0.5">
              {allEntriesSorted.map((entry) => {
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
                      "flex w-full items-start gap-2.5 border border-transparent px-2.5 py-2.5 text-left transition-colors",
                      isActive ? "border-border bg-muted text-foreground" : "hover:border-border hover:bg-muted",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-foreground/80">
                          {format(new Date(entry.dateKey + "T00:00:00"), "EEE, dd MM yyyy")}
                        </span>
                        {mood && (
                          <span className={cn("text-[11px]", mood.color)}>{mood.icon}</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
                        {entry.content.slice(0, 120) || "Empty entry"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === "tags" && (
          <div className="p-3">
            <div className="space-y-1">
              {allTags.map((tag) => {
                const tagEntries = entries.filter(e => e.tags.includes(tag.name));
                return (
                  <div
                    key={tag.id}
                    className="border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-[12px] font-medium text-foreground/80">
                        @{tag.name}
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
                            className="flex w-full items-center gap-1.5 border border-transparent px-1.5 py-1 text-left text-[11px] text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted hover:text-muted-foreground"
                          >
                            <span>{format(new Date(entry.dateKey + "T00:00:00"), "dd MM yyyy")}</span>
                            <span className="truncate">{entry.content.slice(0, 30)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          onClick={goToToday}
          className="flex w-full items-center justify-center gap-1.5 border border-border bg-background px-2 py-2 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          New entry
        </button>
      </div>
    </div>
  );
}
