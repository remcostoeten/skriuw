"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";
import { MOOD_OPTIONS, type MoodLevel } from "@/features/journal/types";
import { useJournalEntry } from "@/features/journal/hooks/use-journal-entry";
import { useJournalTags } from "@/features/journal/hooks/use-journal-queries";

type JournalEntryEditorProps = {
  selectedDate: Date;
};

export function JournalEntryEditor({ selectedDate }: JournalEntryEditorProps) {
  const {
    content,
    setContent,
    entry,
    saveState,
    handleMoodSelect,
    handleRemoveTag,
  } = useJournalEntry(selectedDate);
  const { data: tags = [] } = useJournalTags();

  const entryTags = entry?.tags ?? [];
  const getTagColor = useMemo(
    () => (tagName: string) => tags.find((tag) => tag.name === tagName)?.color ?? "#6366f1",
    [tags],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground/70">Daily note</span>
        {saveState !== "idle" && (
          <span className="rounded-full border border-border/40 bg-background/65 px-1.5 py-0.5 text-[9px] text-muted-foreground/55">
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
                ? "Saved"
                : "Save failed"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-background/55 p-1">
        {(Object.entries(MOOD_OPTIONS) as [MoodLevel, (typeof MOOD_OPTIONS)[MoodLevel]][]).map(
          ([key, mood]) => (
            <button
              key={key}
              onClick={() => handleMoodSelect(key)}
              className={cn(
                "flex h-7 items-center gap-0.5 rounded-lg px-2 text-[10px] transition-all",
                entry?.mood === key
                  ? "bg-accent font-medium text-foreground ring-1 ring-border"
                  : "text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground",
              )}
              title={mood.label}
            >
              <span className={cn("text-[11px]", entry?.mood === key && mood.color)}>
                {mood.icon}
              </span>
            </button>
          ),
        )}
      </div>

      {entryTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entryTags.map((tagName) => (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${getTagColor(tagName)}15`,
                color: getTagColor(tagName),
                borderColor: `${getTagColor(tagName)}35`,
              }}
            >
              @{tagName}
              <button
                onClick={() => handleRemoveTag(tagName)}
                className="rounded-full border border-transparent p-0.5 transition-colors hover:border-current/20 hover:bg-white/10"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Write a quick journal note..."
        className="min-h-[180px] w-full resize-none rounded-2xl border border-border/40 bg-background/55 px-3 py-3 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/35"
      />

      <div className="flex items-center justify-between text-[10px] text-muted-foreground/55">
        <span>{format(selectedDate, "dd MMM yyyy")}</span>
        <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
      </div>
    </div>
  );
}
