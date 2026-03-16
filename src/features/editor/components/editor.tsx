"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Command, FolderOpen, PenSquare } from "lucide-react";
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
      <div className="flex flex-1 items-center justify-center bg-[#1e1e1e] px-6">
        <div className="max-w-md rounded-[1.75rem] border border-white/8 bg-white/[0.03] px-6 py-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/80">
            <PenSquare className="h-6 w-6" strokeWidth={1.6} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white/90">Pick a note to start writing</h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Choose a note from the sidebar, or create a fresh one with the actions at the top left.
          </p>
          <div className="mt-5 grid gap-2 text-left text-xs text-white/55">
            <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              <span>Browse folders and notes from the sidebar tree.</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5">
              <Command className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              <span>Use the command palette for quick actions and navigation.</span>
            </div>
          </div>
        </div>
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
          <div
            role="button"
            tabIndex={0}
            aria-label="Edit note content"
            onClick={() => setIsEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsEditing(true);
              }
            }}
            className="min-h-[80vh] cursor-text rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1e1e]"
          >
            <MarkdownRenderer content={file.content} />
          </div>
        )}
      </div>
    </div>
  );
}
