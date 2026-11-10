import { formatListDate, formatLongDate } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { journalPress, journalRowButton } from "../ledger-group";
import { MOOD_OPTIONS, type JournalEntry } from "../model";
import { openJournalDay } from "../navigation";

function entryTitle(entry: JournalEntry): string {
  return entry.title === "Untitled" ? "Empty entry" : entry.title;
}

export function LedgerEntryRow({ entry, selected }: { entry: JournalEntry; selected: boolean }) {
  const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => openJournalDay(entry.dateKey)}
        aria-current={selected ? "date" : undefined}
        aria-label={`${formatLongDate(entry.dateKey)}, ${entryTitle(entry)}${
          mood ? `, ${mood.label}` : ""
        }`}
        className={cn(
          journalRowButton,
          journalPress,
          "grid-cols-[84px_minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-theme-divider/85 py-2.5 last:border-b-0 max-[899px]:grid-cols-[70px_minmax(0,1fr)_auto]",
          selected && "before:bg-theme-hover hover:before:bg-theme-hover",
        )}
      >
        <span aria-hidden="true" className="text-xs tabular-nums text-theme-secondary">
          {formatListDate(entry.dateKey)}
        </span>
        <span aria-hidden="true" className="truncate text-[13px] font-medium text-foreground">
          {entryTitle(entry)}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex gap-2 text-[11.5px] tabular-nums text-theme-dim"
        >
          <span className="min-w-3.5 text-right font-mono text-theme-secondary">{mood?.icon}</span>
          <span>{entry.wordCount}</span>
        </span>
      </button>
    </li>
  );
}
