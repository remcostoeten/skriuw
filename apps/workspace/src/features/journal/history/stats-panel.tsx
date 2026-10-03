import { formatListDate, todayKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { MOOD_LEVELS, MOOD_OPTIONS, type JournalEntry } from "../model";
import { openJournalDay } from "../navigation";
import type { WordGoalStats } from "../word-goal";
import { MOOD_TREND_SPAN, moodBarLevel, moodTrend, moodTrendSummary } from "./mood-trend";
import { currentStreak } from "./streak";

function streakLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function JournalStats({
  entries,
  goalStats,
}: {
  entries: readonly JournalEntry[];
  goalStats: WordGoalStats | null;
}) {
  const today = todayKey();
  const totalWords = entries.reduce((sum, entry) => sum + entry.wordCount, 0);
  const entryDates = new Set(entries.map((entry) => entry.dateKey));
  const streak = currentStreak(entryDates);
  const trend = moodTrend(entries, today);
  const tiles: { label: string; value: string }[] = [
    { label: "Entries", value: `${entries.length}` },
    { label: "Words", value: `${totalWords}` },
    { label: "Streak", value: streakLabel(streak) },
    {
      label: "This month",
      value: `${entries.filter((entry) => entry.dateKey.startsWith(today.slice(0, 7))).length}`,
    },
    ...(goalStats === null
      ? []
      : [
          { label: "Goal days", value: `${goalStats.metDays}` },
          { label: "Goal streak", value: streakLabel(goalStats.streak) },
        ]),
  ];
  const stripLabel = `Mood, last ${MOOD_TREND_SPAN} days`;
  return (
    <div className="space-y-4 p-3">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-md border border-border/60 bg-card/40 p-3">
            <p className={sectionLabelClass}>{tile.label}</p>
            <p className="mt-1.5 text-[15px] font-semibold text-foreground">{tile.value}</p>
          </div>
        ))}
      </div>
      <div>
        <p className={cn("mb-1.5", sectionLabelClass)}>{stripLabel}</p>
        <ol className="m-0 flex h-10 list-none items-end gap-0.5 p-0" aria-label={stripLabel}>
          {trend.days.map((day) => {
            const mood = day.mood === null ? null : MOOD_OPTIONS[day.mood];
            const state = mood ? mood.label : day.hasEntry ? "No mood" : "No entry";
            const height =
              day.mood === null ? undefined : `${Math.round(moodBarLevel(day.mood) * 100)}%`;
            return (
              <li
                key={day.dateKey}
                className={cn("flex h-full min-w-0 flex-1 basis-0 items-end", mood?.colorClass)}
              >
                <button
                  type="button"
                  className={cn(
                    "min-h-0.5 w-full cursor-pointer rounded-[2px] border-0 bg-current p-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    mood === null &&
                      (day.hasEntry
                        ? "h-[40%] bg-[hsl(var(--muted-foreground)/0.35)]"
                        : "h-0.5 bg-[hsl(var(--muted-foreground)/0.18)]"),
                    day.dateKey === today && "outline-1 outline-offset-1 outline-foreground",
                  )}
                  style={height === undefined ? undefined : { height }}
                  aria-label={`${formatListDate(day.dateKey)}: ${state}`}
                  onClick={() => openJournalDay(day.dateKey)}
                />
              </li>
            );
          })}
        </ol>
        <p className="mt-1.5 text-[11px] text-foreground/70">{moodTrendSummary(trend)}</p>
        {trend.ratedDays > 0 && (
          <ul
            className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground"
            aria-label="Mood counts"
          >
            {MOOD_LEVELS.filter((level) => trend.counts[level] > 0).map((level) => (
              <li key={level} className="flex items-center gap-1">
                <span className={MOOD_OPTIONS[level].colorClass}>{MOOD_OPTIONS[level].icon}</span>
                <span>{MOOD_OPTIONS[level].label}</span>
                <span>{trend.counts[level]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
