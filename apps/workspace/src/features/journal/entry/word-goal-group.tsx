import { useMemo } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { todayKey, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { JournalGroup, JournalRow, MarginLive, MarginMeter, MarginText } from "../ledger-group";
import { sameJournalEntries, selectJournalEntries } from "../model";
import { selectWordGoalHistory, wordGoalFraction, wordGoalOn, wordGoalStats } from "../word-goal";
import { WordGoalControl } from "./word-goal-control";

type Props = {
  store: RendererStore;
  noteId: string | null;
  dateKey: DateKey;
  wordCount: number;
};

function daysLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function WordGoalGroup({ store, noteId, dateKey, wordCount }: Props) {
  const history = useRendererSelector(store, selectWordGoalHistory);
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const today = todayKey();
  const goal = wordGoalOn(history, dateKey);
  const met = goal !== null && wordCount >= goal;
  const stats = useMemo(
    () => (history.length === 0 ? null : wordGoalStats(entries, history, today)),
    [entries, history, today],
  );
  return (
    <JournalGroup
      id="goal"
      title="Word goal"
      margin={
        goal === null ? (
          <>
            <MarginText>Pick a daily number of words, or leave it off.</MarginText>
            <MarginLive>Off by default.</MarginLive>
          </>
        ) : (
          <>
            <MarginText>A daily number of words.</MarginText>
            <MarginMeter
              fraction={wordGoalFraction(wordCount, goal)}
              label={`${wordCount} of ${goal} words`}
              text={`${wordCount} of ${goal} words`}
            />
          </>
        )
      }
    >
      <ul className="m-0 list-none p-0">
        <JournalRow label="Daily goal">
          <span className="-mr-2 inline-flex">
            <WordGoalControl
              store={store}
              noteId={noteId}
              dateKey={dateKey}
              today={today}
              wordCount={wordCount}
            />
          </span>
        </JournalRow>
        {goal !== null && (
          <JournalRow label={dateKey === today ? "Today" : "This day"}>
            {met ? (
              <span className="text-accent-ink">Goal reached</span>
            ) : (
              <>
                <b className="font-medium text-foreground">{wordCount}</b> of {goal},{" "}
                {goal - wordCount} to go
              </>
            )}
          </JournalRow>
        )}
        {stats !== null && goal !== null && (
          <>
            <JournalRow label="Goal days">
              <b className="font-medium text-foreground">{stats.metDays}</b>
            </JournalRow>
            <JournalRow label="Goal streak">
              <b className="font-medium text-foreground">{daysLabel(stats.streak)}</b>
            </JournalRow>
          </>
        )}
      </ul>
    </JournalGroup>
  );
}
