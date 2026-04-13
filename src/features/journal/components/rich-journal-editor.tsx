'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { format, isToday, isYesterday, isTomorrow } from 'date-fns';
import { Trash2, Type } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useJournalStore } from '@/features/journal/store';
import { type MoodLevel, MOOD_OPTIONS } from '@/features/journal/types';
import { RichTextEditor } from '@/features/editor/components/rich-text-editor';

type RichJournalEditorProps = {
  selectedDate: Date;
};

function formatDateHeading(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE');
}

export function RichJournalEditor({ selectedDate }: RichJournalEditorProps) {
  const store = useJournalStore();
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const entry = store.getEntryByDateKey(dateKey);

  const [content, setContent] = useState(entry?.content ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync content when date changes
  useEffect(() => {
    const e = store.getEntryByDateKey(dateKey);
    setContent(e?.content ?? '');
    setShowDeleteConfirm(false);
  }, [dateKey]);

  const debouncedSave = useCallback(
    (newContent: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const existing = store.getEntryByDateKey(dateKey);
        if (existing) {
          store.updateEntryContent(existing.id, newContent);
        } else if (newContent.trim()) {
          store.createOrUpdateEntry(selectedDate, newContent);
        }
      }, 900);
    },
    [dateKey, selectedDate, store],
  );

  const handleContentChange = useCallback(
    (next: { markdown: string }) => {
      setContent(next.markdown);
      debouncedSave(next.markdown);
    },
    [debouncedSave],
  );

  const handleMoodSelect = (mood: MoodLevel) => {
    const existing = store.getEntryByDateKey(dateKey);
    if (existing) {
      store.updateEntryMood(existing.id, existing.mood === mood ? undefined : mood);
    } else {
      store.createOrUpdateEntry(selectedDate, content, [], mood);
    }
  };

  const handleDeleteEntry = () => {
    const existing = store.getEntryByDateKey(dateKey);
    if (existing) {
      store.deleteEntry(existing.id);
      setContent('');
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
    return tag?.color ?? '#6366f1';
  };

  // Extract @mentions from content for display
  const extractedTags = useMemo(() => {
    const mentions = content.match(/@(\w+)/g) || [];
    return [...new Set(mentions.map(m => m.slice(1)))];
  }, [content]);

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
            {format(selectedDate, "EEEE, dd MM yyyy")}
          </p>
        </div>

        {/* Mood selector row */}
        <div className="mt-6 flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
            Mood
          </span>
          <div className="flex items-center gap-1">
            {(Object.entries(MOOD_OPTIONS) as [MoodLevel, typeof MOOD_OPTIONS[MoodLevel]][]).map(
              ([key, mood]) => (
                <button
                  key={key}
                  onClick={() => handleMoodSelect(key)}
                  className={cn(
                    'flex h-8 items-center gap-1 border border-transparent px-2.5 text-[12px] transition-colors',
                    entryMood === key
                      ? 'border-border bg-muted font-medium text-foreground'
                      : 'text-muted-foreground/50 hover:border-border hover:bg-muted hover:text-muted-foreground',
                  )}
                  title={mood.label}
                >
                  <span className={cn('text-[13px]', entryMood === key && mood.color)}>
                    {mood.icon}
                  </span>
                  <span className="hidden sm:inline">{mood.label}</span>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Tags row - show extracted @mentions */}
        {(entryTags.length > 0 || extractedTags.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
              Tags
            </span>
            {[...new Set([...entryTags, ...extractedTags])].map((tagName) => (
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
              </span>
            ))}
          </div>
        )}

        {/* Rich text indicator */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground/40">
          <Type className="h-3 w-3" strokeWidth={1.5} />
          <span>Rich text enabled</span>
        </div>

        {/* Divider */}
        <div className="my-6 h-px bg-border/40" />

        {/* Rich text editor area */}
        <div className="relative min-h-[400px]">
          <RichTextEditor
            content={content}
            onChange={handleContentChange}
          />
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground/40">
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
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
