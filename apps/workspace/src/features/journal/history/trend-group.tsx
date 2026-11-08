import { useMemo, useState } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { formatListDate, todayKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { JournalGroup, MarginText, journalPress } from "../ledger-group";
import { MOOD_LEVELS, MOOD_OPTIONS, sameJournalEntries, selectJournalEntries } from "../model";
import { openJournalDay } from "../navigation";
import { MOOD_TREND_SPAN, moodBarLevel, moodTrend, moodTrendSummary } from "./mood-trend";

export function TrendGroup({ store }: { store: RendererStore }) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const today = todayKey();
  const trend = useMemo(() => moodTrend(entries, today), [entries, today]);
  const summary = moodTrendSummary(trend);
  const [caption, setCaption] = useState<string | null>(null);
  const label = `Mood, last ${MOOD_TREND_SPAN} days`;
  return (
    <JournalGroup
      id="trend"
      title="Mood trend"
      margin={
        <MarginText>
          The last {MOOD_TREND_SPAN} days. Bar height is the mood, a flat bar is a day with no mood.
        </MarginText>
      }
    >
      <ol className="m-0 flex h-16 list-none gap-[3px] p-0" aria-label={label}>
        {trend.days.map((day) => {
          const mood = day.mood === null ? null : MOOD_OPTIONS[day.mood];
          const state = mood ? mood.label : day.hasEntry ? "No mood" : "No entry";
          const text = `${formatListDate(day.dateKey)}, ${state}`;
          return (
            <li key={day.dateKey} className="flex h-full min-w-0 flex-1 basis-0 items-end">
              <button
                type="button"
                aria-label={text}
                onClick={() => openJournalDay(day.dateKey)}
                onPointerEnter={() => setCaption(text)}
                onPointerLeave={() => setCaption(null)}
                onFocus={() => setCaption(text)}
                onBlur={() => setCaption(null)}
                className={cn(
                  "block min-h-0.5 w-full origin-bottom cursor-pointer rounded-[2px] border-0 p-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-75 focus-visible:opacity-75 focus-visible:outline-2 focus-visible:outline-ring",
                  journalPress,
                  mood !== null && "bg-accent-ink",
                  mood === null && day.hasEntry && "h-[40%] bg-theme-dim/45",
                  mood === null && !day.hasEntry && "h-0.5 bg-theme-active",
                  day.dateKey === today &&
                    "outline outline-1 outline-offset-1 outline-theme-secondary",
                )}
                style={
                  day.mood === null
                    ? undefined
                    : { height: `${Math.round(moodBarLevel(day.mood) * 100)}%` }
                }
              />
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 mb-0 min-h-5 text-[12.5px] text-foreground">{caption ?? summary}</p>
      {trend.ratedDays > 0 && (
        <ul
          className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-theme-secondary"
          aria-label="Mood counts"
        >
          {MOOD_LEVELS.filter((level) => trend.counts[level] > 0).map((level) => (
            <li key={level} className="inline-flex gap-1.5 tabular-nums">
              <span aria-hidden="true" className="font-mono text-accent-ink">
                {MOOD_OPTIONS[level].icon}
              </span>
              {MOOD_OPTIONS[level].label} {trend.counts[level]}
            </li>
          ))}
        </ul>
      )}
    </JournalGroup>
  );
}
