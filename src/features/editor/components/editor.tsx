"use client";

import { useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { NoteFile, RichTextDocument } from "@/types/notes";
import { EmptyState } from "@/shared/ui/empty-state";

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
      <div className="flex min-h-full flex-1 items-center justify-center bg-card px-6 py-12">
        <EmptyState
          variant="files"
          title="No file selected"
          description="Choose a note from the sidebar to start writing."
          className="[&_svg]:mb-4 [&_svg]:h-8 [&_svg]:w-8 [&_h2]:text-[15px] [&_p]:mt-1.5 [&_p]:max-w-[240px] [&_p]:text-[13px]"
        />
      </div>
    );
  }
  const containerClass = "flex min-h-full flex-1 flex-col overflow-y-auto bg-card";
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
