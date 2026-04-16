"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { type MoodLevel, MOOD_OPTIONS } from "@/features/journal/types";
import {
  findActiveTagMention,
  replaceActiveTagMention,
} from "@/features/journal/components/tag-mention-utils";

type JournalEntryEditorProps = {
  selectedDate: Date;
};

export function JournalEntryEditor({ selectedDate }: JournalEntryEditorProps) {
  const store = useJournalStore();
  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const entry = store.getEntryByDateKey(dateKey);

  const [content, setContent] = useState(entry?.content ?? "");
  const [showTagPopup, setShowTagPopup] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagCursorStart, setTagCursorStart] = useState<number | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupId = useId();
  const helpTextId = `${popupId}-help`;
  const statusTextId = `${popupId}-status`;

  // Sync content when date changes
  useEffect(() => {
    const e = store.getEntryByDateKey(dateKey);
    setContent(e?.content ?? "");
    setShowTagPopup(false);
    setTagQuery("");
  }, [dateKey, store]);

  const suggestions = useMemo(() => {
    return store.getTagSuggestions(tagQuery);
  }, [store, tagQuery]);

  const canCreateTag =
    tagQuery.trim().length > 0 &&
    !suggestions.some((suggestion) => suggestion.name === tagQuery.trim().toLowerCase());

  const popupOptions = useMemo(
    () => [
      ...suggestions.map((tag) => ({
        id: `${popupId}-${tag.id}`,
        key: tag.id,
        kind: "suggestion" as const,
        name: tag.name,
        color: tag.color,
        usageCount: tag.usageCount,
      })),
      ...(canCreateTag
        ? [
            {
              id: `${popupId}-create`,
              key: "__create__",
              kind: "create" as const,
              name: tagQuery.trim().toLowerCase(),
            },
          ]
        : []),
    ],
    [canCreateTag, popupId, suggestions, tagQuery],
  );

  const activeOptionId =
    showTagPopup && popupOptions[selectedSuggestionIdx]
      ? popupOptions[selectedSuggestionIdx].id
      : undefined;

  useEffect(() => {
    if (selectedSuggestionIdx >= popupOptions.length) {
      setSelectedSuggestionIdx(0);
    }
  }, [popupOptions.length, selectedSuggestionIdx]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (newContent: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (newContent.trim()) {
          const existing = store.getEntryByDateKey(dateKey);
          if (existing) {
            store.updateEntryContent(existing.id, newContent);
          } else {
            store.createOrUpdateEntry(selectedDate, newContent);
          }
        }
      }, 500);
    },
    [dateKey, selectedDate, store],
  );

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);
    debouncedSave(newContent);

    const activeMention = findActiveTagMention(newContent, cursorPos);

    if (activeMention) {
      setShowTagPopup(true);
      setTagQuery(activeMention.query);
      setTagCursorStart(activeMention.start);
      setSelectedSuggestionIdx(0);
    } else {
      setShowTagPopup(false);
      setTagQuery("");
      setTagCursorStart(null);
    }
  };

  const insertTag = useCallback(
    (tagName: string) => {
      if (tagCursorStart === null) return;

      const cursorPos = textareaRef.current?.selectionStart ?? content.length;
      const replacement = replaceActiveTagMention(content, tagCursorStart, cursorPos, tagName);
      const newContent = replacement.content;

      setContent(newContent);
      setShowTagPopup(false);
      setTagQuery("");
      setTagCursorStart(null);
      setSelectedSuggestionIdx(0);

      // Cancel any pending debounced save to prevent it from overwriting tags
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      // Save content and add tag synchronously
      const existing = store.getEntryByDateKey(dateKey);
      if (existing) {
        store.updateEntryContent(existing.id, newContent);
        store.addTagToEntry(existing.id, tagName);
      } else {
        const created = store.createOrUpdateEntry(selectedDate, newContent);
        store.addTagToEntry(created.id, tagName);
      }

      // Focus back and position cursor
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            replacement.cursorPosition,
            replacement.cursorPosition,
          );
        }
      });
    },
    [content, tagCursorStart, store, dateKey, selectedDate],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showTagPopup || popupOptions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev + 1) % popupOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev - 1 + popupOptions.length) % popupOptions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const option = popupOptions[selectedSuggestionIdx];
      if (!option) return;
      if (option.kind === "create") {
        handleCreateAndInsertTag();
      } else {
        insertTag(option.name);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowTagPopup(false);
      setSelectedSuggestionIdx(0);
    }
  };

  const handleCreateAndInsertTag = () => {
    if (!tagQuery.trim()) return;
    const normalizedTag = tagQuery.trim().toLowerCase();
    store.createTag(normalizedTag);
    insertTag(normalizedTag);
  };

  const handleMoodSelect = (mood: MoodLevel) => {
    const existing = store.getEntryByDateKey(dateKey);
    if (existing) {
      store.updateEntryMood(existing.id, existing.mood === mood ? undefined : mood);
    } else {
      store.createOrUpdateEntry(selectedDate, content, [], mood);
    }
  };

  const handleRemoveTag = (tagName: string) => {
    const existing = store.getEntryByDateKey(dateKey);
    if (existing) {
      store.removeTagFromEntry(existing.id, tagName);
      const cleaned = content.replace(new RegExp(`@${tagName}\\s?`, "g"), "");
      setContent(cleaned);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      store.updateEntryContent(existing.id, cleaned);
    }
  };

  const currentEntry = store.getEntryByDateKey(dateKey);
  const entryTags = currentEntry?.tags ?? [];
  const entryMood = currentEntry?.mood;
  const allTags = store.getAllTags();

  // Resolve tag colors
  const getTagColor = (name: string): string => {
    const tag = allTags.find((t) => t.name === name);
    return tag?.color ?? "#6366f1";
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Date display */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground/70">Daily note</span>
        {content.trim() && (
          <span className="rounded-full border border-border/40 bg-background/65 px-1.5 py-0.5 text-[9px] text-muted-foreground/55">
            auto-saved
          </span>
        )}
      </div>

      {/* Mood selector */}
      <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-background/55 p-1">
        {(Object.entries(MOOD_OPTIONS) as [MoodLevel, (typeof MOOD_OPTIONS)[MoodLevel]][]).map(
          ([key, mood]) => (
            <button
              key={key}
              onClick={() => handleMoodSelect(key)}
              className={cn(
                "flex h-7 items-center gap-0.5 rounded-lg px-2 text-[10px] transition-all",
                entryMood === key
                  ? "bg-accent font-medium text-foreground ring-1 ring-border"
                  : "text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground",
              )}
              title={mood.label}
            >
              <span className={cn("text-[11px]", entryMood === key && mood.color)}>
                {mood.icon}
              </span>
            </button>
          ),
        )}
      </div>

      {/* Editor with tag popup */}
      <div className="relative">
        <span id={helpTextId} className="sr-only">
          Type at-sign to open tag suggestions. Use arrow keys to move through results, Enter or Tab
          to insert a tag, and Escape to close the menu.
        </span>
        <span id={statusTextId} className="sr-only" aria-live="polite" aria-atomic="true">
          {showTagPopup
            ? popupOptions.length > 0
              ? `${popupOptions.length} tag option${popupOptions.length === 1 ? "" : "s"} available.`
              : "No tag options available."
            : ""}
        </span>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setShowTagPopup(false);
            setSelectedSuggestionIdx(0);
          }}
          placeholder="Write about your day... Use @ to tag"
          aria-label="Daily note"
          aria-describedby={`${helpTextId} ${statusTextId}`}
          aria-autocomplete="list"
          aria-controls={showTagPopup ? popupId : undefined}
          aria-expanded={showTagPopup}
          aria-activedescendant={activeOptionId}
          className="min-h-[148px] w-full resize-none rounded-xl border border-border/55 bg-background/75 px-3 py-3 text-[13px] leading-relaxed text-foreground shadow-inner outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-border focus:bg-background"
          spellCheck
        />

        {/* Tag autocomplete popup */}
        {showTagPopup && (
          <div
            id={popupId}
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute bottom-full left-0 z-50 mb-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
          >
            {popupOptions.length > 0 ? (
              <div className="max-h-[140px] overflow-y-auto p-1">
                {popupOptions.map((option, idx) => (
                  <button
                    key={option.key}
                    id={option.id}
                    role="option"
                    type="button"
                    aria-selected={idx === selectedSuggestionIdx}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      option.kind === "create" ? handleCreateAndInsertTag() : insertTag(option.name)
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      idx === selectedSuggestionIdx
                        ? "bg-accent text-foreground"
                        : "text-foreground/70 hover:bg-accent/50",
                      option.kind === "create" && "border-t border-border/50 text-indigo-400",
                    )}
                  >
                    {option.kind === "create" ? (
                      <span className="text-[10px]">+</span>
                    ) : (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: option.color }}
                      />
                    )}
                    <span className="truncate">
                      {option.kind === "create" ? `Create @${option.name}` : `@${option.name}`}
                    </span>
                    {option.kind === "suggestion" ? (
                      <span className="ml-auto text-[10px] text-muted-foreground/50">
                        {option.usageCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2.5 py-2 text-[12px] text-muted-foreground/70">
                Continue typing to find or create a tag.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active tags */}
      {entryTags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {entryTags.map((tagName) => (
            <span
              key={tagName}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${getTagColor(tagName)}18`,
                color: getTagColor(tagName),
              }}
            >
              @{tagName}
              <button
                onClick={() => handleRemoveTag(tagName)}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/10"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
