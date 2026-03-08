'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useJournalStore } from '@/modules/journal';
import { MOOD_OPTIONS } from '@/types/notes';
import { SidebarSection } from '../sidebar-section';
import { MiniCalendar } from './mini-calendar';
import { JournalEntryEditor } from './journal-entry-editor';

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
  const store = useJournalStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'entries'>('calendar');

  const datesWithEntries = store.getDatesWithEntries();
  const entryCount = store.config.entries.length;

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
            onClick={() => setView('calendar')}
            className={cn(
              'rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
              view === 'calendar'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/40',
            )}
          >
            Calendar
          </button>
          <button
            onClick={() => setView('entries')}
            className={cn(
              'rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
              view === 'entries'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/40',
            )}
          >
            Recent
          </button>
        </div>

        {view === 'calendar' ? (
          <>
            <MiniCalendar
              selectedDate={selectedDate}
              currentMonth={currentMonth}
              datesWithEntries={datesWithEntries}
              onSelectDate={setSelectedDate}
              onChangeMonth={setCurrentMonth}
            />
            <div className="border-t border-border/40 pt-2">
              <JournalEntryEditor selectedDate={selectedDate} />
            </div>
          </>
        ) : (
          <div className="space-y-1 px-2">
            {recentEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-accent/15 px-3 py-3">
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
                      const [year, month, day] = entry.dateKey.split('-').map(Number);
                      const entryDate = new Date(year, month - 1, day);
                      setSelectedDate(entryDate);
                      setCurrentMonth(entryDate);
                      setView('calendar');
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-foreground/80">
                          {format(new Date(entry.dateKey + 'T00:00:00'), 'MMM d')}
                        </span>
                        {mood && (
                          <span className={cn('text-[10px]', mood.color)}>
                            {mood.icon}
                          </span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
                        {entry.content.slice(0, 100)}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-accent/60 px-1.5 py-px text-[9px] text-muted-foreground"
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
