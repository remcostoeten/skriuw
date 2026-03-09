"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ChevronRight, NotebookPen } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { MOOD_OPTIONS } from "@/features/journal/types";
import { SidebarSection } from "../sidebar-section";
import { MiniCalendar } from "./mini-calendar";

type JournalSectionProps = {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility?: () => void;
};

export function JournalSection({
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
}: JournalSectionProps) {
  const router = useRouter();
  const store = useJournalStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"calendar" | "entries">("calendar");

  const datesWithEntries = store.getDatesWithEntries();
  const entryCount = store.config.entries.length;
  const selectedEntry = store.getEntryByDateKey(format(selectedDate, "yyyy-MM-dd"));
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");

  const openJournalDate = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    router.push(`/journal?date=${dateKey}`);
  };

  // Recent entries for the "entries" view
  const recentEntries = useMemo(() => {
    return [...store.config.entries]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [store.config.entries]);

  const todayButton = (
    <button
      onClick={() => {
        const today = new Date();
        setSelectedDate(today);
        setCurrentMonth(today);
      }}
      className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Go to today"
    >
      <CalendarDays className="h-3 w-3" strokeWidth={1.5} />
      Today
    </button>
  );

  return (
    <SidebarSection
      id="journal"
      title="Journal"
      isCollapsed={isCollapsed}
      itemCount={entryCount}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      actions={todayButton}
    >
      <div className="space-y-2">
        {/* View toggle */}
        <div className="flex items-center gap-1 px-2">
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              view === "calendar"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/40",
            )}
          >
            Calendar
          </button>
          <button
            onClick={() => setView("entries")}
            className={cn(
              "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
              view === "entries"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/40",
            )}
          >
            Recent
          </button>
        </div>

        {view === "calendar" ? (
          <div className="overflow-hidden rounded-2xl border border-border/45 bg-gradient-to-b from-background/85 via-background/60 to-accent/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <MiniCalendar
              selectedDate={selectedDate}
              currentMonth={currentMonth}
              datesWithEntries={datesWithEntries}
              onSelectDate={(date) => {
                setSelectedDate(date);
                openJournalDate(date);
              }}
              onChangeMonth={setCurrentMonth}
            />
            <div className="border-t border-border/50 bg-background/55 px-2 py-2">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-accent/[0.16] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                    Selected day
                  </p>
                  <p className="truncate text-[12px] font-medium text-foreground/80">
                    {format(selectedDate, "EEEE, dd MM yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-border/40 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground/70">
                  <NotebookPen className="h-3 w-3" strokeWidth={1.5} />
                  {selectedEntry?.content?.trim() ? "Entry open" : "Empty day"}
                </div>
              </div>
              <button
                onClick={() => openJournalDate(selectedDate)}
                className="flex w-full items-center justify-between rounded-xl border border-border/45 bg-background/75 px-3 py-2.5 text-left transition-colors hover:bg-accent/[0.14]"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground/80">
                    Open {format(selectedDate, "dd MM yyyy")} in Journal
                  </p>
                  <p className="text-[10px] text-muted-foreground/65">
                    {selectedEntry?.content?.trim()
                      ? "Continue writing in the full journal editor."
                      : "Create this day’s note in the full journal editor."}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/45 bg-background/45 px-2 py-1">
            {recentEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-accent/[0.08] px-3 py-3">
                <p className="text-xs text-muted-foreground/70">
                  No journal entries yet. Select a date and start writing.
                </p>
              </div>
            ) : (
              recentEntries.map((entry) => {
                const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      const [year, month, day] = entry.dateKey.split("-").map(Number);
                      const entryDate = new Date(year, month - 1, day);
                      setSelectedDate(entryDate);
                      setCurrentMonth(entryDate);
                      router.push(`/journal?date=${entry.dateKey}`);
                    }}
                    className="flex w-full items-start gap-2 rounded-xl border-b border-border/35 px-2.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/[0.14]"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-foreground/72">
                          {format(new Date(entry.dateKey + "T00:00:00"), "dd MM yyyy")}
                        </span>
                        {mood && <span className={cn("text-[10px]", mood.color)}>{mood.icon}</span>}
                        {entry.dateKey === selectedDateKey && (
                          <span className="text-[9px] text-muted-foreground/45">selected</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/62">
                        {entry.content.slice(0, 100)}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border/35 bg-background/55 px-1.5 py-px text-[9px] text-muted-foreground/70"
                            >
                              @{tag}
                            </span>
                          ))}
                          {entry.tags.length > 3 && (
                            <span className="text-[9px] text-muted-foreground/50">
                              +{entry.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </SidebarSection>
  );
}
