import { useState } from 'react';
import { NoteFile } from '@/types/notes';
import { MarkdownRenderer } from './MarkdownRenderer';

interface EditorProps {
  file: NoteFile | null;
  onContentChange: (id: string, content: string) => void;
}

export function Editor({ file, onContentChange }: EditorProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-haptic-editor">
        <p className="text-haptic-dim text-sm">Select a note to start editing</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-haptic-editor">
      <div className="max-w-2xl mx-auto px-8 py-8">
        {isEditing ? (
          <textarea
            value={file.content}
            onChange={(e) => onContentChange(file.id, e.target.value)}
            onBlur={() => setIsEditing(false)}
            className="w-full min-h-[80vh] bg-transparent text-foreground/90 font-mono text-sm resize-none outline-none leading-relaxed"
            autoFocus
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
