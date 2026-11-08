import { useMemo } from "react";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { formatListDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { JournalGroup, MarginText, journalPress, journalRowButton } from "../ledger-group";
import { MOOD_OPTIONS, selectJournalEntries, type MoodLevel } from "../model";
import { openJournalDay } from "../navigation";
import { entryExcerpt, onThisDay } from "./on-this-day";

type OnThisDayProps = {
  store: RendererStore;
  dateKey: DateKey;
};

type Memory = {
  noteId: string;
  dateKey: DateKey;
  label: string;
  mood: MoodLevel | null;
  excerpt: string;
};

function sameMemories(left: readonly Memory[], right: readonly Memory[]): boolean {
  return (
    left.length === right.length &&
    left.every((memory, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        memory.noteId === other.noteId &&
        memory.dateKey === other.dateKey &&
        memory.label === other.label &&
        memory.mood === other.mood &&
        memory.excerpt === other.excerpt
      );
    })
  );
}

/** Earlier entries that share this day: a week, a month, and whole years back. */
export function OnThisDaySection({ store, dateKey }: OnThisDayProps) {
  const selectMemories = useMemo(
    () =>
      (state: RendererState): Memory[] =>
        onThisDay(selectJournalEntries(state), dateKey).map(({ entry, label }) => ({
          noteId: entry.noteId,
          dateKey: entry.dateKey,
          label,
          mood: entry.mood,
          excerpt: entryExcerpt(state.documents.get(entry.noteId)?.markdown ?? ""),
        })),
    [dateKey],
  );
  const memories = useRendererSelector(store, selectMemories, sameMemories);
  if (memories.length === 0) {
    return null;
  }
  return (
    <JournalGroup
      id="on-this-day"
      title="On this day"
      margin={<MarginText>A week and a month back, and the same date in earlier years.</MarginText>}
    >
      <ul className="m-0 list-none p-0">
        {memories.map((memory) => {
          const mood = memory.mood ? MOOD_OPTIONS[memory.mood] : null;
          return (
            <li key={memory.noteId}>
              <button
                type="button"
                onClick={() => openJournalDay(memory.dateKey)}
                className={cn(
                  journalRowButton,
                  journalPress,
                  "grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-theme-divider/85 py-2.5 last:border-b-0",
                )}
              >
                <span className="text-xs text-foreground">
                  {memory.label}
                  {mood && (
                    <span className="ml-2 text-theme-dim">
                      <span aria-hidden="true">{mood.icon}</span> {mood.label}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11.5px] text-theme-dim">
                  {formatListDate(memory.dateKey)}
                </span>
                {memory.excerpt && (
                  <span className="col-span-full line-clamp-2 text-[13px] leading-[1.5] text-theme-secondary">
                    {memory.excerpt}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </JournalGroup>
  );
}
