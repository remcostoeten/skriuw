import { useMemo, useState } from "react";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { LedgerEntryRow } from "../history/ledger-entry-row";
import {
  JournalGroup,
  MarginLive,
  MarginText,
  journalPress,
  journalTransition,
} from "../ledger-group";
import { sameJournalEntries, selectJournalEntries } from "../model";
import { entriesWithTag, projectJournalTags } from "./projection";

type Props = {
  store: RendererStore;
  dateKey: DateKey;
};

function selectTagRecords(state: RendererState) {
  return state.tags;
}

function entriesLabel(count: number): string {
  return count === 1 ? "1 entry" : `${count} entries`;
}

export function TagsGroup({ store, dateKey }: Props) {
  const entries = useRendererSelector(store, selectJournalEntries, sameJournalEntries);
  const tagRecords = useRendererSelector(store, selectTagRecords);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const tags = useMemo(() => projectJournalTags(tagRecords, entries), [entries, tagRecords]);
  const mine = useMemo(
    () => new Set(entries.find((entry) => entry.dateKey === dateKey)?.tagIds ?? []),
    [entries, dateKey],
  );
  const ordered = useMemo(
    () => [...tags].sort((left, right) => Number(mine.has(right.id)) - Number(mine.has(left.id))),
    [tags, mine],
  );
  const selected = ordered.find((tag) => tag.id === selectedTagId) ?? null;
  const tagged = selected === null ? [] : entriesWithTag(entries, selected.id);
  return (
    <JournalGroup
      id="tags"
      title="Tags"
      margin={
        <>
          <MarginText>Written as #tag in an entry.</MarginText>
          <MarginLive>
            {mine.size === 0
              ? "None in this entry"
              : `${mine.size} ${mine.size === 1 ? "tag" : "tags"} in this entry`}
          </MarginLive>
        </>
      }
    >
      {ordered.length === 0 ? (
        <p className="m-0 pb-2 text-[12.5px] leading-normal text-theme-secondary">
          Tag an entry with <span className="font-medium text-foreground">#</span> and it shows up
          here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 pb-2.5">
            {ordered.map((tag) => {
              const active = tag.id === selected?.id;
              const inEntry = mine.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${tag.name}, ${entriesLabel(tag.entryCount)}${
                    inEntry ? ", used in this entry" : ""
                  }`}
                  onClick={() => setSelectedTagId(active ? null : tag.id)}
                  className={cn(
                    "inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-full border px-[9px] text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
                    active
                      ? "border-theme-btn-outline bg-theme-hover text-foreground"
                      : "border-theme-divider/85 text-theme-secondary hover:bg-theme-hover hover:text-foreground",
                    journalTransition,
                    journalPress,
                  )}
                >
                  {inEntry && (
                    <span aria-hidden="true" className="size-[5px] rounded-full bg-accent-ink" />
                  )}
                  <span aria-hidden="true">#{tag.name}</span>
                  <span aria-hidden="true" className="text-[11px] text-theme-dim">
                    {tag.entryCount}
                  </span>
                </button>
              );
            })}
          </div>
          {selected !== null && (
            <>
              <p
                role="status"
                className="m-0 border-t border-theme-divider/85 pt-2.5 pb-0.5 text-[11.5px] text-theme-dim"
              >
                {entriesLabel(tagged.length)} tagged {selected.name}
              </p>
              <ul className="m-0 list-none p-0">
                {tagged.map((entry) => (
                  <LedgerEntryRow
                    key={entry.noteId}
                    entry={entry}
                    selected={entry.dateKey === dateKey}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </JournalGroup>
  );
}
