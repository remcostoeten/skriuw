"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { NoteFile, RichTextDocument } from "@/types/notes";
import { MarkdownRenderer } from "./markdown-renderer";

type EditorMode = "raw" | "block";

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote
const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((mod) => ({ default: mod.RichTextEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading block editor...</div>
      </div>
    ),
  },
);

interface EditorProps {
  file: NoteFile | null;
  editorMode: EditorMode;
  isMobile?: boolean;
  onContentChange: (
    id: string,
    content: string,
    options?: {
      richContent?: RichTextDocument;
      preferredEditorMode?: EditorMode;
    },
  ) => void;
}

export function Editor({ file, editorMode, onContentChange }: EditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && isEditing) {
      textareaRef.current.style.height = "auto";
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

  const handleMarkdownChange = useCallback(
    (content: string) => {
      if (file) {
        onContentChange(file.id, content);
      }
    },
    [file, onContentChange],
  );

  const handleRichTextChange = useCallback(
    (next: { markdown: string; richContent: RichTextDocument }) => {
      if (file) {
        onContentChange(file.id, next.markdown, {
          richContent: next.richContent,
          preferredEditorMode: "block",
        });
      }
    },
    [file, onContentChange],
  );

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Select a note to start editing</p>
      </div>
    );
  }

  const containerClass = "flex min-h-full flex-1 flex-col overflow-y-auto bg-[#1e1e1e]";
  const contentClass = "mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:px-8 sm:py-8";

  if (editorMode === "block") {
    return (
      <div className={containerClass}>
        <RichTextEditor
          content={file.content}
          richContent={file.richContent}
          onChange={handleRichTextChange}
        />
      </div>
    );
  }

  // Raw mode
  return (
    <div className={containerClass}>
      <div className={contentClass}>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={file.content}
            onChange={(e) => handleMarkdownChange(e.target.value)}
            onBlur={() => setIsEditing(false)}
            className="w-full min-h-[80vh] bg-transparent text-foreground/90 font-mono text-sm resize-none outline-hidden leading-relaxed"
            spellCheck={false}
          />
        ) : (
          <div onClick={() => setIsEditing(true)} className="min-h-[80vh] cursor-text">
            <MarkdownRenderer content={file.content} />
          </div>
        )}
      </div>
    </div>
  );
}
