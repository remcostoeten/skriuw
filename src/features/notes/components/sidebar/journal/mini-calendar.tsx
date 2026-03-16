'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  format,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type MiniCalendarProps = {
  selectedDate: Date;
  currentMonth: Date;
  datesWithEntries: string[];
  onSelectDate: (date: Date) => void;
  onChangeMonth: (date: Date) => void;
};

export function MiniCalendar({
  selectedDate,
  currentMonth,
  datesWithEntries,
  onSelectDate,
  onChangeMonth,
}: MiniCalendarProps) {
  const [direction, setDirection] = useState(0);
  
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const entrySet = useMemo(() => new Set(datesWithEntries), [datesWithEntries]);

  const handlePrevMonth = () => {
    setDirection(-1);
    onChangeMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setDirection(1);
    onChangeMonth(addMonths(currentMonth, 1));
  };

  const monthKey = format(currentMonth, 'yyyy-MM');

  return (
    <div className="px-2">
      {/* Month navigation */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          onClick={() => onChangeMonth(subMonths(currentMonth, 1))}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <span className="text-[11px] font-medium text-foreground/80">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => onChangeMonth(addMonths(currentMonth, 1))}
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
            className="flex h-6 items-center justify-center text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const inCurrentMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const hasEntry = entrySet.has(dateKey);
          const dayIsToday = isToday(day);

          return (
            <button
              key={dateKey}
              onClick={() => onSelectDate(day)}
              className={cn(
                'relative flex h-7 w-full items-center justify-center rounded-md text-[11px] transition-colors',
                !inCurrentMonth && 'text-muted-foreground/30',
                inCurrentMonth && !isSelected && 'text-foreground/70 hover:bg-accent/60',
                isSelected && 'bg-foreground text-background font-medium',
                dayIsToday && !isSelected && 'font-semibold text-foreground',
              )}
            >
              {format(day, 'd')}
              {hasEntry && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400" />
              )}
              {hasEntry && isSelected && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-background/70" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
