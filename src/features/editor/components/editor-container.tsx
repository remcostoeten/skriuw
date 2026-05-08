"use client";

import { useRef, useState, useCallback } from "react";
import { Editor } from "./editor";
import { EditorToolbar } from "./editor-toolbar";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { callAi, type AiEditorHandle } from "@/features/ai/service";

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
  onRenameFile?: (id: string, name: string) => void;
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
  onRenameFile,
}: EditorContainerProps) {
  const aiHandleRef = useRef<AiEditorHandle | null>(null);
  const [aiLoading, setAiLoading] = useState({
    generateTitle: false,
    spellCheck: false,
    continueWriting: false,
  });

  const handleEditorReady = useCallback((handle: AiEditorHandle) => {
    aiHandleRef.current = handle;
  }, []);

  const handleAiGenerateTitle = useCallback(async () => {
    if (!aiHandleRef.current || !file || !onRenameFile) return;
    setAiLoading((s) => ({ ...s, generateTitle: true }));
    try {
      const markdown = await aiHandleRef.current.getMarkdown();
      if (!markdown.trim()) return;
      const title = await callAi("generateTitle", markdown);
      if (title) onRenameFile(file.id, title);
    } catch (err) {
      console.error("[AI/generateTitle]", err);
    } finally {
      setAiLoading((s) => ({ ...s, generateTitle: false }));
    }
  }, [file, onRenameFile]);

  const handleAiSpellCheck = useCallback(async () => {
    if (!aiHandleRef.current) return;
    setAiLoading((s) => ({ ...s, spellCheck: true }));
    try {
      const markdown = await aiHandleRef.current.getMarkdown();
      if (!markdown.trim()) return;
      const corrected = await callAi("spellCheck", markdown);
      if (corrected) aiHandleRef.current.replaceContent(corrected);
    } catch (err) {
      console.error("[AI/spellCheck]", err);
    } finally {
      setAiLoading((s) => ({ ...s, spellCheck: false }));
    }
  }, []);

  const handleAiContinueWriting = useCallback(async () => {
    if (!aiHandleRef.current) return;
    setAiLoading((s) => ({ ...s, continueWriting: true }));
    try {
      const markdown = await aiHandleRef.current.getMarkdown();
      if (!markdown.trim()) return;
      const continuation = await callAi("continueWriting", markdown);
      if (continuation) aiHandleRef.current.appendContent(continuation);
    } catch (err) {
      console.error("[AI/continueWriting]", err);
    } finally {
      setAiLoading((s) => ({ ...s, continueWriting: false }));
    }
  }, []);

  const isAiAvailable = editorMode === "block";

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
        aiLoading={aiLoading}
        onAiGenerateTitle={isAiAvailable && onRenameFile ? handleAiGenerateTitle : undefined}
        onAiSpellCheck={isAiAvailable ? handleAiSpellCheck : undefined}
        onAiContinueWriting={isAiAvailable ? handleAiContinueWriting : undefined}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Editor
          file={file}
          files={files}
          editorMode={editorMode}
          isMobile={isMobile}
          onContentChange={onContentChange}
          onEditorReady={handleEditorReady}
        />
      </div>
    </div>
  );
}
