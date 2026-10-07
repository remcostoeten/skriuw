import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import { cn } from "@/shared/styling/class-names";
import { sectionLabelClass } from "@/shared/ui/section-header";
import type { JournalEntry } from "../model";
import { EntryRow } from "../sidebar/entry-row";
import { entriesWithTag, type JournalTag } from "./projection";

function TagDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", color === null && "bg-muted-foreground/40")}
      style={color === null ? undefined : { backgroundColor: color }}
    />
  );
}

export function JournalTags({
  tags,
  entries,
  selectedTagId,
  selectedKey,
  onSelectTag,
}: {
  tags: readonly JournalTag[];
  entries: readonly JournalEntry[];
  selectedTagId: string | null;
  selectedKey: DateKey;
  onSelectTag: (tagId: string | null) => void;
}) {
  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null;
  const tagged = selectedTag === null ? [] : entriesWithTag(entries, selectedTag.id);
  if (tags.length === 0) {
    return (
      <div className="p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          Tag an entry with <span className="font-medium text-foreground/70">#</span> and it shows
          up here.
        </p>
      </div>
    );
  }
  return (
    <div className="p-2">
      <p className={cn("mb-1.5", sectionLabelClass)}>Tags ({tags.length})</p>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => {
          const active = tag.id === selectedTag?.id;
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={active}
              aria-label={`${tag.name}, ${tag.entryCount} ${
                tag.entryCount === 1 ? "entry" : "entries"
              }`}
              onClick={() => onSelectTag(active ? null : tag.id)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none ${
                active
                  ? "border-border bg-muted font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground/75"
              }`}
            >
              <TagDot color={tag.color} />
              <span aria-hidden="true">{tag.name}</span>
              <span aria-hidden="true" className="text-muted-foreground/50">
                {tag.entryCount}
              </span>
            </button>
          );
        })}
      </div>
      {selectedTag !== null && (
        <div className="mt-3">
          <p role="status" className={cn("mb-1.5", sectionLabelClass)}>
            {tagged.length} {tagged.length === 1 ? "entry" : "entries"} tagged {selectedTag.name}
          </p>
          <div className="space-y-0.5">
            {tagged.map((entry) => (
              <EntryRow
                key={entry.noteId}
                entry={entry}
                selected={entry.dateKey === selectedKey}
                dense
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
