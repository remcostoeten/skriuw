"use client";

import { useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Command, FolderOpen, PenSquare } from "lucide-react";
import { NoteFile, RichTextDocument } from "@/types/notes";

type EditorMode = "raw" | "block";

// Dynamically import RichTextEditor to avoid SSR issues with BlockNote
const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((mod) => ({ default: mod.RichTextEditor })),
  {
    ssr: false,
    loading: () => null,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [file?.content]);

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
      <div className="flex min-h-full flex-1 items-center justify-center bg-haptic-editor px-6 py-8">
        <div className="w-full max-w-md border border-border bg-accent/30 px-6 py-7 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center border border-border bg-accent/50 text-muted-foreground">
            <PenSquare className="h-6 w-6" strokeWidth={1.6} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Pick a note to start writing</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Choose a note from the sidebar, or create a fresh one with the actions at the top left.
          </p>
          <div className="mt-5 grid gap-2 text-left text-xs text-muted-foreground">
            <div className="flex items-center gap-2 border border-border bg-accent/20 px-3 py-2.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              <span>Browse folders and notes from the sidebar tree.</span>
            </div>
            <div className="flex items-center gap-2 border border-border bg-accent/20 px-3 py-2.5">
              <Command className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              <span>Use the command palette for quick actions and navigation.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const containerClass = "flex min-h-full flex-1 flex-col overflow-y-auto bg-haptic-editor";
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
        <textarea
          ref={textareaRef}
          value={file.content}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          className="w-full min-h-[80vh] bg-transparent text-foreground/90 font-mono text-sm resize-none outline-hidden leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
