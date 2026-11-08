import { Fragment, useMemo, useState } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { formatMonthTitle } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { useSelectedJournalKey } from "../navigation/selected-day";
import { JournalGroup, MarginText, journalPress, journalTransition } from "../ledger-group";
import { sameJournalEntries, selectJournalEntries, type JournalEntry } from "../model";
import { LedgerEntryRow } from "./ledger-entry-row";
import { groupEntriesByMonth } from "./totals";

const PAGE_SIZE = 6;

function MonthRows({
  entries,
  selectedKey,
  continuesMonth,
}: {
  entries: readonly JournalEntry[];
  selectedKey: string;
  continuesMonth: string | null;
}) {
  const groups = useMemo(() => groupEntriesByMonth(entries), [entries]);
  return (
    <ul className="m-0 list-none p-0">
      {groups.map((group) => {
        const title = formatMonthTitle(group.month);
        return (
          <Fragment key={title}>
            {title !== continuesMonth && (
              <li className="pt-3.5 pb-0.5 text-[11px] text-theme-dim first:pt-0">{title}</li>
            )}
            {group.entries.map((entry) => (
              <LedgerEntryRow
                key={entry.noteId}
                entry={entry}
                selected={entry.dateKey === selectedKey}
              />
            ))}
          </Fragment>
        );
      })}
    </ul>
  );
}

export function EntriesGroup({ store }: { store: RendererStore }) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const selectedKey = useSelectedJournalKey();
  const [open, setOpen] = useState(false);
  const first = entries.slice(0, PAGE_SIZE);
  const rest = entries.slice(PAGE_SIZE);
  const lastShown = first.at(-1);
  const continuesMonth =
    lastShown === undefined ? null : formatMonthTitle(groupEntriesByMonth([lastShown])[0]!.month);
  return (
    <JournalGroup
      id="entries"
      title="Entries"
      heading={
        <>
          Entries{" "}
          <span className="ml-1 text-[10.5px] font-normal text-theme-dim">{entries.length}</span>
        </>
      }
      margin={
        <>
          <MarginText>Newest first, by month.</MarginText>
          {rest.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="journal-more-entries"
              onClick={() => setOpen((value) => !value)}
              className={cn(
                "-ml-[9px] mt-2.5 inline-flex h-[26px] cursor-pointer items-center rounded-md px-[9px] text-xs text-theme-secondary hover:bg-theme-hover hover:text-foreground",
                journalTransition,
                journalPress,
              )}
            >
              {open ? "Show fewer" : `Show all ${entries.length}`}
            </button>
          )}
        </>
      }
    >
      {entries.length === 0 ? (
        <p className="m-0 pb-2 text-[12.5px] leading-normal text-theme-secondary">
          Your first entry shows up here as soon as you write a word or pick a mood.
        </p>
      ) : (
        <>
          <MonthRows entries={first} selectedKey={selectedKey} continuesMonth={null} />
          {rest.length > 0 && (
            <div
              id="journal-more-entries"
              data-open={open}
              inert={!open}
              className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] data-[open=true]:grid-rows-[1fr] motion-reduce:transition-none"
            >
              <div className="min-h-0 overflow-hidden">
                <MonthRows
                  entries={rest}
                  selectedKey={selectedKey}
                  continuesMonth={continuesMonth}
                />
              </div>
            </div>
          )}
        </>
      )}
    </JournalGroup>
  );
}
