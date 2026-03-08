'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useJournalStore, JournalTag } from '@/modules/journal';
import { MoodLevel, MOOD_OPTIONS } from '@/types/notes';

type JournalEntryEditorProps = {
  selectedDate: Date;
};

export function JournalEntryEditor({ selectedDate }: JournalEntryEditorProps) {
  const store = useJournalStore();
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const entry = store.getEntryByDateKey(dateKey);

  const [content, setContent] = useState(entry?.content ?? '');
  const [showTagPopup, setShowTagPopup] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [tagCursorStart, setTagCursorStart] = useState<number | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync content when date changes
  useEffect(() => {
    const e = store.getEntryByDateKey(dateKey);
    setContent(e?.content ?? '');
    setShowTagPopup(false);
    setTagQuery('');
  }, [dateKey, store]);

  const suggestions = useMemo(() => {
    return store.getTagSuggestions(tagQuery);
  }, [store, tagQuery]);

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

    // Detect @ trigger
    const textBeforeCursor = newContent.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowTagPopup(true);
      setTagQuery(atMatch[1]);
      setTagCursorStart(cursorPos - atMatch[0].length);
      setSelectedSuggestionIdx(0);
    } else {
      setShowTagPopup(false);
      setTagQuery('');
      setTagCursorStart(null);
    }
  };

  const insertTag = useCallback(
    (tagName: string) => {
      if (tagCursorStart === null) return;

      const before = content.slice(0, tagCursorStart);
      const cursorPos = textareaRef.current?.selectionStart ?? content.length;
      const after = content.slice(cursorPos);
      const newContent = `${before}@${tagName} ${after}`;

      setContent(newContent);
      setShowTagPopup(false);
      setTagQuery('');
      setTagCursorStart(null);

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
          const newCursorPos = tagCursorStart + tagName.length + 2; // +2 for @ and space
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [content, tagCursorStart, store, dateKey, selectedDate],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showTagPopup || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertTag(suggestions[selectedSuggestionIdx].name);
    } else if (e.key === 'Escape') {
      setShowTagPopup(false);
    }
  };

  const handleCreateAndInsertTag = () => {
    if (!tagQuery.trim()) return;
    store.createTag(tagQuery.trim());
    insertTag(tagQuery.trim());
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
      const cleaned = content.replace(new RegExp(`@${tagName}\\s?`, 'g'), '');
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
    return tag?.color ?? '#6366f1';
  };

  return (
    <div className="flex flex-col gap-2 px-2">
      {/* Date display */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground/70">
          {format(selectedDate, 'EEEE, MMM d')}
        </span>
        {content.trim() && (
          <span className="text-[9px] text-muted-foreground/50">auto-saved</span>
        )}
      </div>

      {/* Mood selector */}
      <div className="flex items-center gap-1">
        {(Object.entries(MOOD_OPTIONS) as [MoodLevel, typeof MOOD_OPTIONS[MoodLevel]][]).map(
          ([key, mood]) => (
            <button
              key={key}
              onClick={() => handleMoodSelect(key)}
              className={cn(
                'flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[10px] transition-all',
                entryMood === key
                  ? 'bg-accent font-medium text-foreground ring-1 ring-border'
                  : 'text-muted-foreground/60 hover:bg-accent/40 hover:text-muted-foreground',
              )}
              title={mood.label}
            >
              <span className={cn('text-[11px]', entryMood === key && mood.color)}>
                {mood.icon}
              </span>
            </button>
          ),
        )}
      </div>

      {/* Editor with tag popup */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Write about your day... Use @ to tag"
          className="min-h-[120px] w-full resize-none rounded-lg border border-border/60 bg-accent/20 px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-border focus:bg-accent/30"
          spellCheck
        />

        {/* Tag autocomplete popup */}
        {showTagPopup && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.length > 0 ? (
              <div className="max-h-[140px] overflow-y-auto p-1">
                {suggestions.map((tag, idx) => (
                  <button
                    key={tag.id}
                    onClick={() => insertTag(tag.name)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors',
                      idx === selectedSuggestionIdx
                        ? 'bg-accent text-foreground'
                        : 'text-foreground/70 hover:bg-accent/50',
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">@{tag.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground/50">
                      {tag.usageCount}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {tagQuery.trim() && !suggestions.some((s) => s.name === tagQuery.trim().toLowerCase()) && (
              <button
                onClick={handleCreateAndInsertTag}
                className="flex w-full items-center gap-2 border-t border-border/50 px-2.5 py-2 text-left text-[12px] text-indigo-400 transition-colors hover:bg-accent/50"
              >
                <span className="text-[10px]">+</span>
                <span>Create @{tagQuery.trim()}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active tags */}
      {entryTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
