import { useMemo } from "react";
import { cn } from "@/shared/lib/utils";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { formatLongDate, type DateKey } from "./dates";
import { MOOD_OPTIONS, selectJournalEntries, type MoodLevel } from "./model";
import { openJournalDay } from "./navigation";
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
    <section aria-labelledby="journal-on-this-day" className="border-t border-border/55 pb-8 pt-5">
      <h2 id="journal-on-this-day" className={cn("mb-2", sectionLabelClass)}>
        On this day
      </h2>
      <ul className="space-y-1">
        {memories.map((memory) => {
          const mood = memory.mood ? MOOD_OPTIONS[memory.mood] : null;
          return (
            <li key={memory.noteId}>
              <button
                type="button"
                onClick={() => openJournalDay(memory.dateKey)}
                className="-mx-2 block w-[calc(100%+1rem)] rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-3"
              >
                <span className="flex items-baseline gap-2 text-[11px]">
                  <span className="font-medium text-foreground/80">{memory.label}</span>
                  <span className="text-muted-foreground/60">{formatLongDate(memory.dateKey)}</span>
                  {mood && (
                    <>
                      <span aria-hidden="true" className={mood.colorClass}>
                        {mood.icon}
                      </span>
                      <span className="sr-only">{mood.label}</span>
                    </>
                  )}
                </span>
                {memory.excerpt.length > 0 && (
                  <span className="mt-1 line-clamp-2 block text-[13px] leading-relaxed text-muted-foreground">
                    {memory.excerpt}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
