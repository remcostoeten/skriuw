"use client";

import { useRef, useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Editor } from "./editor";
import { EditorToolbar } from "./editor-toolbar";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { callAi, AiRateLimitError, type AiEditorHandle, type AiAction } from "@/features/ai/service";
import { usePreferencesStore } from "@/features/settings/store";

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

type RateLimitPrompt = {
  action: AiAction;
  exhaustedKeyIds: string[];
};

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
  const [rateLimitPrompt, setRateLimitPrompt] = useState<RateLimitPrompt | null>(null);

  const { ai: aiPrefs } = usePreferencesStore();

  const getActiveKey = useCallback(
    (excludeIds: string[] = []) => {
      const available = aiPrefs.keys.filter((k) => !excludeIds.includes(k.id));
      if (available.length === 0) return null;
      const preferred = available.find((k) => k.id === aiPrefs.activeKeyId);
      return preferred ?? available[0];
    },
    [aiPrefs.keys, aiPrefs.activeKeyId],
  );

  const runAiAction = useCallback(
    async (action: AiAction, keyId?: string, exhaustedIds: string[] = []) => {
      if (!aiHandleRef.current) return;

      const keyEntry = keyId
        ? aiPrefs.keys.find((k) => k.id === keyId)
        : getActiveKey(exhaustedIds);

      const options = {
        apiKey: keyEntry?.apiKey ?? null,
        model: aiPrefs.model,
      };

      setAiLoading((s) => ({ ...s, [action]: true }));
      setRateLimitPrompt(null);

      try {
        const markdown = await aiHandleRef.current.getMarkdown();
        if (!markdown.trim()) return;

        const result = await callAi(action, markdown, options);
        if (!result) return;

        if (action === "generateTitle") {
          if (file && onRenameFile) onRenameFile(file.id, result);
        } else if (action === "spellCheck") {
          aiHandleRef.current.replaceContent(result);
        } else {
          aiHandleRef.current.appendContent(result);
        }
      } catch (err) {
        if (err instanceof AiRateLimitError) {
          const newExhausted = keyEntry ? [...exhaustedIds, keyEntry.id] : exhaustedIds;
          setRateLimitPrompt({ action, exhaustedKeyIds: newExhausted });
        } else {
          console.error(`[AI/${action}]`, err);
        }
      } finally {
        setAiLoading((s) => ({ ...s, [action]: false }));
      }
    },
    [aiPrefs.keys, aiPrefs.activeKeyId, aiPrefs.model, file, onRenameFile, getActiveKey],
  );

  const handleEditorReady = useCallback((handle: AiEditorHandle) => {
    aiHandleRef.current = handle;
  }, []);

  const isAiAvailable = editorMode === "block";

  const availableKeysForFallback = rateLimitPrompt
    ? aiPrefs.keys.filter((k) => !rateLimitPrompt.exhaustedKeyIds.includes(k.id))
    : [];

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
        onAiGenerateTitle={
          isAiAvailable && onRenameFile && aiPrefs.keys.length > 0
            ? () => runAiAction("generateTitle")
            : undefined
        }
        onAiSpellCheck={
          isAiAvailable && aiPrefs.keys.length > 0 ? () => runAiAction("spellCheck") : undefined
        }
        onAiContinueWriting={
          isAiAvailable && aiPrefs.keys.length > 0
            ? () => runAiAction("continueWriting")
            : undefined
        }
      />

      {rateLimitPrompt && (
        <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-xs">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
            strokeWidth={1.5}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-amber-300/80">
              Key{" "}
              <span className="font-medium text-amber-200">
                &ldquo;
                {aiPrefs.keys.find((k) => k.id === rateLimitPrompt.exhaustedKeyIds.at(-1))?.name ??
                  "Unknown"}
                &rdquo;
              </span>{" "}
              is rate limited.
            </span>
            {availableKeysForFallback.length > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="text-amber-400/60">Retry with:</span>
                {availableKeysForFallback.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() =>
                      runAiAction(rateLimitPrompt.action, k.id, rateLimitPrompt.exhaustedKeyIds)
                    }
                    className="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300 transition-colors hover:bg-amber-500/20"
                  >
                    {k.name}
                  </button>
                ))}
              </span>
            ) : (
              <span className="text-amber-400/60">All keys rate limited.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setRateLimitPrompt(null)}
            className="mt-0.5 shrink-0 text-amber-400/50 transition-colors hover:text-amber-400"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

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
