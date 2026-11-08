import { useMemo } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { shiftDay, todayKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { JournalGroup, JournalRow, MarginText } from "../ledger-group";
import { sameJournalEntries, selectJournalEntries } from "../model";
import { selectWordGoalHistory, wordGoalStats } from "../word-goal";
import { journalTotals } from "./totals";

const DOT_SPAN = 14;

function daysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function TotalsGroup({ store }: { store: RendererStore }) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const history = useRendererSelector(store, selectWordGoalHistory);
  const today = todayKey();
  const totals = useMemo(
    () =>
      journalTotals(
        entries,
        history.length === 0 ? null : wordGoalStats(entries, history, today),
        today,
      ),
    [entries, history, today],
  );
  const dates = useMemo(() => new Set(entries.map((entry) => entry.dateKey)), [entries]);
  const dots = useMemo(
    () => Array.from({ length: DOT_SPAN }, (_, index) => shiftDay(today, index - DOT_SPAN + 1)),
    [today],
  );
  const note =
    totals.entries === 0
      ? "Nothing written yet."
      : dates.has(today)
        ? "Your streak includes today."
        : totals.streak > 0
          ? "Write today to keep the streak."
          : "A streak starts with one entry.";
  return (
    <JournalGroup
      id="totals"
      title="Totals"
      margin={
        <>
          <MarginText>{note}</MarginText>
          <div
            role="img"
            aria-label={`Entries over the last ${DOT_SPAN} days`}
            className="mt-3 grid max-w-[150px] grid-cols-[repeat(14,1fr)] gap-[3px] max-[899px]:hidden"
          >
            {dots.map((key) => (
              <i
                key={key}
                className={cn(
                  "aspect-square rounded-full",
                  dates.has(key) ? "bg-accent-ink" : "bg-theme-active",
                )}
              />
            ))}
          </div>
        </>
      }
    >
      <ul className="m-0 list-none p-0">
        <JournalRow label="Entries">
          <b className="font-medium text-foreground">{totals.entries}</b>
        </JournalRow>
        <JournalRow label="Words">
          <b className="font-medium text-foreground">{totals.words.toLocaleString()}</b>
        </JournalRow>
        <JournalRow label="Streak">
          <b className="font-medium text-foreground">{daysLabel(totals.streak)}</b>
        </JournalRow>
        <JournalRow label="This month">
          <b className="font-medium text-foreground">{totals.thisMonth}</b>
        </JournalRow>
        {totals.goalDays !== null && (
          <JournalRow label="Goal days">
            <b className="font-medium text-foreground">{totals.goalDays}</b>
          </JournalRow>
        )}
        {totals.goalStreak !== null && (
          <JournalRow label="Goal streak">
            <b className="font-medium text-foreground">{daysLabel(totals.goalStreak)}</b>
          </JournalRow>
        )}
      </ul>
    </JournalGroup>
  );
}
