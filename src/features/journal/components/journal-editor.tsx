"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { format, isToday, isYesterday, isTomorrow } from "date-fns";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useJournalStore } from "@/features/journal/store";
import { type MoodLevel, MOOD_OPTIONS } from "@/features/journal/types";
import { findActiveTagMention, replaceActiveTagMention } from "./tag-mention-utils";

type JournalEditorProps = {
  selectedDate: Date;
};

function formatDateHeading(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE");
}

export function JournalEditor({ selectedDate }: JournalEditorProps) {
  const store = useJournalStore();
  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const entry = store.getEntryByDateKey(dateKey);

  const [content, setContent] = useState(entry?.content ?? "");
  const [showTagPopup, setShowTagPopup] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagCursorStart, setTagCursorStart] = useState<number | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    setShowDeleteConfirm(false);

    // Focus the editor
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [dateKey]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(400, textarea.scrollHeight)}px`;
  }, [content]);

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
      }, 900);
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

      // Ensure entry exists first, then add tag
      const existing = store.getEntryByDateKey(dateKey);
      if (existing) {
        store.updateEntryContent(existing.id, newContent);
        store.addTagToEntry(existing.id, tagName);
      } else {
        const created = store.createOrUpdateEntry(selectedDate, newContent);
        store.addTagToEntry(created.id, tagName);
      }

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
      // Also remove @tag from content text
      const cleaned = content.replace(new RegExp(`@${tagName}\\s?`, "g"), "");
      setContent(cleaned);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      store.updateEntryContent(existing.id, cleaned);
    }
  };

  const handleDeleteEntry = () => {
    const existing = store.getEntryByDateKey(dateKey);
    if (existing) {
      store.deleteEntry(existing.id);
      setContent("");
      setShowDeleteConfirm(false);
    }
  };

  const currentEntry = store.getEntryByDateKey(dateKey);
  const entryTags = currentEntry?.tags ?? [];
  const entryMood = currentEntry?.mood;
  const allTags = store.getAllTags();
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const getTagColor = (name: string): string => {
    const tag = allTags.find((t) => t.name === name);
    return tag?.color ?? "#6366f1";
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Notion-like centered content area */}
      <div className="mx-auto w-full max-w-[720px] px-6 py-12 md:px-16 lg:py-20">
        {/* Date heading */}
        <div className="mb-1">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-foreground lg:text-[38px]">
            {formatDateHeading(selectedDate)}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground/60">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </p>
        </div>

        {/* Mood selector row */}
        <div className="mt-6 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
            Mood
          </span>
          <div className="flex items-center gap-1">
            {(Object.entries(MOOD_OPTIONS) as [MoodLevel, (typeof MOOD_OPTIONS)[MoodLevel]][]).map(
              ([key, mood]) => (
                <button
                  key={key}
                  onClick={() => handleMoodSelect(key)}
                  className={cn(
                    "flex h-8 items-center gap-1 border border-transparent px-2.5 text-[12px] transition-colors",
                    entryMood === key
                      ? "border-border bg-muted font-medium text-foreground"
                      : "text-muted-foreground/50 hover:border-border hover:bg-muted hover:text-muted-foreground",
                  )}
                  title={mood.label}
                >
                  <span className={cn("text-[13px]", entryMood === key && mood.color)}>
                    {mood.icon}
                  </span>
                  <span className="hidden sm:inline">{mood.label}</span>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Tags row */}
        {entryTags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
              Tags
            </span>
            {entryTags.map((tagName) => (
              <span
                key={tagName}
                className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium"
                style={{
                  backgroundColor: `${getTagColor(tagName)}15`,
                  color: getTagColor(tagName),
                  borderColor: `${getTagColor(tagName)}35`,
                }}
              >
                @{tagName}
                <button
                  onClick={() => handleRemoveTag(tagName)}
                  className="border border-transparent p-0.5 transition-colors hover:border-current/20 hover:bg-white/10"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Divider */}
        <div className="my-6 h-px bg-border/40" />

        {/* Editor area */}
        <div className="relative">
          <span id={helpTextId} className="sr-only">
            Type at-sign to open tag suggestions. Use arrow keys to move through results, Enter or
            Tab to insert a tag, and Escape to close the menu.
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
            placeholder="Start writing... Use @ to mention tags."
            aria-label="Journal entry"
            aria-describedby={`${helpTextId} ${statusTextId}`}
            aria-autocomplete="list"
            aria-controls={showTagPopup ? popupId : undefined}
            aria-expanded={showTagPopup}
            aria-activedescendant={activeOptionId}
            className="w-full resize-none bg-transparent text-[16px] leading-[1.75] text-foreground outline-none placeholder:text-muted-foreground/30 md:text-[17px]"
            style={{ minHeight: "400px" }}
            spellCheck
          />

          {/* Tag autocomplete popup */}
          {showTagPopup && (
            <div
              id={popupId}
              role="listbox"
              aria-label="Tag suggestions"
              className="absolute left-0 top-8 z-50 w-64 overflow-hidden border border-border bg-popover"
            >
              {popupOptions.length > 0 ? (
                <div className="max-h-[220px] overflow-y-auto p-1.5">
                  {popupOptions.map((option, idx) => (
                    <button
                      key={option.key}
                      id={option.id}
                      role="option"
                      type="button"
                      aria-selected={idx === selectedSuggestionIdx}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() =>
                        option.kind === "create"
                          ? handleCreateAndInsertTag()
                          : insertTag(option.name)
                      }
                      className={cn(
                        "flex w-full items-center gap-2.5 border border-transparent px-3 py-2 text-left text-[13px] transition-colors",
                        idx === selectedSuggestionIdx
                          ? "border-border bg-muted text-foreground"
                          : "text-foreground/70 hover:border-border hover:bg-muted",
                        option.kind === "create" && "border-t border-border text-indigo-400",
                      )}
                    >
                      {option.kind === "create" ? (
                        <span className="text-[11px]">+</span>
                      ) : (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      <span className="truncate">
                        {option.kind === "create" ? `Create @${option.name}` : `@${option.name}`}
                      </span>
                      {option.kind === "suggestion" ? (
                        <span className="ml-auto text-[10px] text-muted-foreground/40">
                          {option.usageCount}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 text-[13px] text-muted-foreground/70">
                  Continue typing to find or create a tag.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground/40">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
            {content.trim() && (
              <span className="text-[11px] text-muted-foreground/30">auto-saved</span>
            )}
          </div>
          {currentEntry && (
            <div className="relative">
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-400/70">Delete this entry?</span>
                  <button
                    onClick={handleDeleteEntry}
                    className="border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="border border-transparent px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1 border border-transparent px-2 py-1 text-[11px] text-muted-foreground/40 transition-colors hover:border-border hover:bg-muted hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
