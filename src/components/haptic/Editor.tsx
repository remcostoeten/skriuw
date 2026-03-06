'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { NoteFile, MoodLevel, MOOD_OPTIONS } from '@/types/notes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { JournalMetadataEditor } from './JournalMetadataEditor';
import { EditorMode } from './EditorToolbar';
import { cn } from '@/lib/utils';

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote
const RichTextEditor = dynamic(
  () => import('./RichTextEditor').then(mod => ({ default: mod.RichTextEditor })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading editor...</div>
      </div>
    )
  }
);

// Helper to detect if content is a journal entry
function isJournalEntry(content: string): boolean {
  // Check for journal patterns: mood:, tags:, or date header format
  return /^#\s+\w+\s+\d+,\s+\d{4}/m.test(content) || 
         (/mood:/i.test(content) && /tags:/i.test(content));
}

// Parse mood and tags from journal content
function parseJournalMetadata(content: string): { mood?: MoodLevel; tags: string[] } {
  const moodMatch = content.match(/mood:\s*(\w+)/i);
  const tagsMatch = content.match(/tags:\s*(.+?)(?:\n|$)/i);
  
  const mood = moodMatch?.[1]?.toLowerCase() as MoodLevel | undefined;
  const validMood = mood && mood in MOOD_OPTIONS ? mood : undefined;
  
  const tagsStr = tagsMatch?.[1]?.trim() || '';
  const tags = tagsStr
    .split(/[,\s]+/)
    .map(t => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean);
  
  return { mood: validMood, tags };
}

// Update content with new mood/tags
function updateJournalContent(content: string, mood?: MoodLevel, tags: string[] = []): string {
  let updated = content;
  
  // Update mood
  if (/mood:/i.test(updated)) {
    updated = updated.replace(/mood:\s*\w*/i, `mood: ${mood || ''}`);
  }
  
  // Update tags
  if (/tags:/i.test(updated)) {
    const tagsStr = tags.length > 0 ? tags.map(t => `#${t}`).join(' ') : '';
    updated = updated.replace(/tags:\s*.*/i, `tags: ${tagsStr}`);
  }
  
  return updated;
}

interface EditorProps {
  file: NoteFile | null;
  editorMode: EditorMode;
  onContentChange: (id: string, content: string) => void;
}

export function Editor({ file, editorMode, onContentChange }: EditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showMetadataPanel, setShowMetadataPanel] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect if this is a journal entry
  const isJournal = useMemo(() => 
    file ? isJournalEntry(file.content) : false, 
    [file?.content]
  );

  // Parse journal metadata
  const journalMeta = useMemo(() => 
    file && isJournal ? parseJournalMetadata(file.content) : { mood: undefined, tags: [] },
    [file?.content, isJournal]
  );

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [file?.content, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleContentChange = useCallback((content: string) => {
    if (file) {
      onContentChange(file.id, content);
    }
  }, [file, onContentChange]);

  const handleMoodChange = useCallback((mood: MoodLevel | undefined) => {
    if (file && isJournal) {
      const updated = updateJournalContent(file.content, mood, journalMeta.tags);
      onContentChange(file.id, updated);
    }
  }, [file, isJournal, journalMeta.tags, onContentChange]);

  const handleTagsChange = useCallback((tags: string[]) => {
    if (file && isJournal) {
      const updated = updateJournalContent(file.content, journalMeta.mood, tags);
      onContentChange(file.id, updated);
    }
  }, [file, isJournal, journalMeta.mood, onContentChange]);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Select a note to start editing</p>
      </div>
    );
  }

  // Common container styles for both modes
  const containerClass = "flex-1 overflow-y-auto bg-background";
  const contentClass = "max-w-[42rem] mx-auto px-8 py-8";

  // Rich Text Mode (BlockNote)
  if (editorMode === 'richtext') {
    return (
      <div className={containerClass}>
        <RichTextEditor
          content={file.content}
          onChange={handleContentChange}
        />
      </div>
    );
  }

  // Markdown Mode
  return (
    <div className={cn(containerClass, "flex relative")}>
      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        <div className={contentClass}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={file.content}
              onChange={(e) => onContentChange(file.id, e.target.value)}
              onBlur={() => setIsEditing(false)}
              className="w-full min-h-[80vh] bg-transparent text-foreground/90 font-mono text-sm resize-none outline-none leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="min-h-[80vh] cursor-text"
            >
              <MarkdownRenderer content={file.content} />
            </div>
          )}
        </div>
      </div>

      {/* Journal metadata sidebar */}
      {isJournal && showMetadataPanel && (
        <div className="w-64 shrink-0 border-l border-border bg-card/50 overflow-y-auto">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Journal Entry
              </h3>
              <button
                onClick={() => setShowMetadataPanel(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                Hide
              </button>
            </div>
            <JournalMetadataEditor
              selectedMood={journalMeta.mood}
              selectedTags={journalMeta.tags}
              onMoodChange={handleMoodChange}
              onTagsChange={handleTagsChange}
            />
          </div>
        </div>
      )}

      {/* Show button when panel is hidden */}
      {isJournal && !showMetadataPanel && (
        <button
          onClick={() => setShowMetadataPanel(true)}
          className="absolute right-4 top-4 px-2 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent transition-colors"
        >
          Show Journal Panel
        </button>
      )}
    </div>
  );
}
