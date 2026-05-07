"use client";

import { Editor } from "./editor";
import { EditorToolbar } from "./editor-toolbar";
import type { NoteFile, RichTextDocument } from "@/types/notes";

interface EditorContainerProps {
  file: NoteFile | null;
  files?: NoteFile[];
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
  onToggleEditorMode: () => void;
  onOpenSettings?: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  fileName: string;
}

export function EditorContainer({
  file,
  files = [],
  editorMode,
  isMobile,
  onContentChange,
  onToggleSidebar,
  onToggleMetadata,
  onToggleEditorMode,
  onOpenSettings,
  onNavigatePrev,
  onNavigateNext,
  canNavigatePrev,
  canNavigateNext,
  fileName,
}: EditorContainerProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <EditorToolbar
        fileName={fileName}
        editorMode={editorMode}
        isMobile={isMobile}
        onToggleSidebar={onToggleSidebar}
        onToggleMetadata={onToggleMetadata}
        onToggleEditorMode={onToggleEditorMode}
        onOpenSettings={onOpenSettings}
        onNavigatePrev={onNavigatePrev}
        onNavigateNext={onNavigateNext}
        canNavigatePrev={canNavigatePrev}
        canNavigateNext={canNavigateNext}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Editor
          file={file}
          files={files}
          editorMode={editorMode}
          isMobile={isMobile}
          onContentChange={onContentChange}
        />
      </div>
    </div>
  );
}
