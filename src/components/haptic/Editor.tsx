'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { NoteFile } from '@/types/notes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { EditorMode } from './EditorToolbar';

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote
const RichTextEditor = dynamic(
  () => import('./RichTextEditor').then(mod => ({ default: mod.RichTextEditor })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-haptic-editor">
        <div className="text-haptic-dim text-sm">Loading editor...</div>
      </div>
    )
  }
);

interface EditorProps {
  file: NoteFile | null;
  editorMode: EditorMode;
  onContentChange: (id: string, content: string) => void;
}

export function Editor({ file, editorMode, onContentChange }: EditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-haptic-editor">
        <p className="text-haptic-dim text-sm">Select a note to start editing</p>
      </div>
    );
  }

  // Common container styles for both modes
  const containerClass = "flex-1 overflow-y-auto bg-haptic-editor";
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
    <div className={containerClass}>
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
  );
}
