import { formatListDate, formatLongDate } from "@skriuw/renderer-core/journal/dates";
import { MOOD_OPTIONS, type JournalEntry } from "../model";
import { openJournalDay } from "../navigation";

function entryListTitle(entry: JournalEntry): string {
  return entry.title === "Untitled" ? "Empty entry" : entry.title;
}

export function EntryRow({
  entry,
  selected,
  dense,
}: {
  entry: JournalEntry;
  selected: boolean;
  dense: boolean;
}) {
  const mood = entry.mood ? MOOD_OPTIONS[entry.mood] : null;
  return (
    <button
      type="button"
      onClick={() => openJournalDay(entry.dateKey)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${formatLongDate(entry.dateKey)}, ${entryListTitle(entry)}${
        mood ? `, ${mood.label}` : ""
      }`}
      className={`flex w-full items-center gap-1.5 rounded-md border border-transparent px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        dense ? "py-1.5" : "py-2"
      } ${selected ? "border-border bg-muted text-foreground" : "hover:border-border hover:bg-muted"}`}
    >
      <span
        aria-hidden="true"
        className="w-[86px] shrink-0 text-[10px] font-medium text-muted-foreground"
      >
        {formatListDate(entry.dateKey)}
      </span>
      {mood && (
        <span aria-hidden="true" className={`text-[10px] ${mood.colorClass}`}>
          {mood.icon}
        </span>
      )}
      <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
        {entryListTitle(entry)}
      </span>
    </button>
  );
}
