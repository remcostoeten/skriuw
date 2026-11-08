import { useMemo } from "react";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { formatLongDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { setJournalMood } from "../actions";
import { moodBarLevel, moodTrend } from "../history/mood-trend";
import { JournalGroup, MarginText } from "../ledger-group";
import {
  journalEntryMood,
  journalNoteIdForDate,
  sameJournalEntries,
  selectJournalEntries,
  type MoodLevel,
} from "../model";
import { MoodSelector } from "./mood-selector";

const STRIP_SPAN = 7;

type Props = {
  store: RendererStore;
  dateKey: DateKey;
};

function WeekStrip({ store, dateKey }: Props) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const days = useMemo(() => moodTrend(entries, dateKey, STRIP_SPAN).days, [entries, dateKey]);
  return (
    <ul
      className="mt-3 flex h-7 max-w-[150px] list-none items-end gap-[3px] p-0"
      role="img"
      aria-label={`Mood over the ${STRIP_SPAN} days up to ${formatLongDate(dateKey)}`}
    >
      {days.map((day) => (
        <li key={day.dateKey} className="flex h-full flex-1 items-end">
          <i
            className={cn(
              "block w-full min-h-0.5 rounded-[2px]",
              day.mood !== null && "bg-accent-ink",
              day.mood === null && day.hasEntry && "h-[40%] bg-theme-dim/50",
              day.mood === null && !day.hasEntry && "h-0.5 bg-theme-active",
              day.dateKey === dateKey &&
                "outline outline-1 outline-offset-1 outline-theme-secondary",
            )}
            style={
              day.mood === null
                ? undefined
                : { height: `${Math.round(moodBarLevel(day.mood) * 100)}%` }
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function MoodGroup({ store, dateKey }: Props) {
  const selectNoteId = useMemo(
    () => (state: RendererState) => journalNoteIdForDate(state, dateKey),
    [dateKey],
  );
  const selectMood = useMemo(
    () => (state: RendererState) => {
      const noteId = selectNoteId(state);
      return noteId === null ? null : journalEntryMood(state, noteId);
    },
    [selectNoteId],
  );
  const noteId = useRendererSelector(store, selectNoteId);
  const mood = useRendererSelector(store, selectMood);

  function toggleMood(level: MoodLevel): void {
    if (noteId === null) {
      return;
    }
    setJournalMood(store, noteId, mood === level ? null : level);
  }

  return (
    <JournalGroup
      id="mood"
      title="Mood"
      margin={
        <>
          <MarginText>How the day felt.</MarginText>
          <WeekStrip store={store} dateKey={dateKey} />
        </>
      }
    >
      <MoodSelector
        mood={mood}
        label={`Mood for ${formatLongDate(dateKey)}`}
        onSelect={toggleMood}
      />
    </JournalGroup>
  );
}
