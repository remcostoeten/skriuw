"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { MOOD_OPTIONS } from "@/features/journal/types";
import { SidebarSection } from "../sidebar-section";
import { MiniCalendar } from "./mini-calendar";

type JournalSectionProps = {
  isCollapsed: boolean;
  showHeader?: boolean;
  compactMode?: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility?: () => void;
};

export function JournalSection({
  isCollapsed,
  showHeader = true,
  compactMode = false,
  onToggleCollapse,
  onToggleVisibility,
}: JournalSectionProps) {
  const router = useRouter();
  const store = useJournalStore();
  const initializeJournal = useJournalStore((state) => state.initialize);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<"calendar" | "entries">("calendar");

  const datesWithEntries = store.getDatesWithEntries();
  const entryCount = store.config.entries.length;
  const selectedEntry = store.getEntryByDateKey(format(selectedDate, "yyyy-MM-dd"));
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    void initializeJournal();
  }, [initializeJournal]);

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
      className="flex h-6 items-center gap-1 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
      showHeader={showHeader}
      compactMode={compactMode}
      itemCount={entryCount}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      actions={todayButton}
    >
      <div className={cn("space-y-2", compactMode && "space-y-1")}>
        <div className={cn("flex items-center gap-1")}>
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "px-2 py-1 text-[10px] font-medium transition-colors",
              compactMode && "px-1.5 py-0.5",
              view === "calendar"
                ? "border rounded-sm border-border bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground/75",
            )}
          >
            Calendar
          </button>
          <button
            onClick={() => setView("entries")}
            className={cn(
              "px-2 py-1 text-[10px] font-medium transition-colors",
              view === "entries"
                ? "border rounded-sm border-border bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground/75",
            )}
          >
            Recent
          </button>
        </div>

        {view === "calendar" ? (
          <div className={cn(
            "overflow-hidden ",
            compactMode && "rounded-[16px]",
          )}>
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
            <div className={cn("border-t border-border px-2.5 py-2.5", compactMode && "px-2 py-2")}>
              <button
                onClick={() => openJournalDate(selectedDate)}
                className={cn(
                  "group flex w-full items-center justify-between ",
                  " py-3 text-left",
                  compactMode && "px-2.5 py-2.5",
                  "transition-all duration-150",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className={cn("text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70", compactMode && "text-[9px]")}>
                    Open entry
                  </p>
                  <p className="text-[11px] font-medium text-foreground/85">
                    {format(selectedDate, "dd MM yyyy")}
                  </p>
                  <p className={cn("text-[10px] leading-relaxed text-muted-foreground/66", compactMode && "text-[9px]")}>
                    {selectedEntry?.content?.trim()
                      ? "Continue writing in the full journal editor."
                      : "Create this day’s note in the full journal editor."}
                  </p>
                </div>
                <span className={cn(
                  "ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground",
                  compactMode && "ml-2 h-6 w-6",
                )}>
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                </span>
              </button>
            </div>
          </div>
        ) : (
<div>            {recentEntries.length === 0 ? (
              <div className={cn("border border-dashed border-border bg-accent/[0.08] px-3 py-3", compactMode && "px-2 py-2")}>
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
                    className={cn(
                      "flex w-full items-start gap-2 border-b border-border px-2.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent/[0.14]",
                      compactMode && "px-2 py-2",
                    )}
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
                              className="border border-border bg-background/55 px-1.5 py-px text-[9px] text-muted-foreground/70"
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
