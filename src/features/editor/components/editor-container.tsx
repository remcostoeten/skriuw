"use client";

import { Editor } from "./editor";
import { EditorToolbar } from "./editor-toolbar";
import type { NoteFile, RichTextDocument } from "@/types/notes";

interface EditorContainerProps {
  file: NoteFile | null;
  editorMode: "raw" | "block";
  isMobile: boolean;
  onContentChange: (
    id: string,
    content: string,
    options?: {
      richContent?: RichTextDocument;
      preferredEditorMode?: "raw" | "block";
    },
  ) => void;
  onToggleSidebar: () => void;
  onToggleMetadata: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  fileName: string;
}

export function EditorContainer({
  file,
  editorMode,
  isMobile,
  onContentChange,
  onToggleSidebar,
  onToggleMetadata,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev,
  canNavigateNext,
  fileName,
}: EditorContainerProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EditorToolbar
        fileName={fileName}
        isMobile={isMobile}
        onToggleSidebar={onToggleSidebar}
        onToggleMetadata={onToggleMetadata}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
      />
      <div className="flex-1 overflow-hidden">
        <Editor
          file={file}
          editorMode={editorMode}
          isMobile={isMobile}
          onContentChange={onContentChange}
        />
      </div>
    </div>
  );
}
