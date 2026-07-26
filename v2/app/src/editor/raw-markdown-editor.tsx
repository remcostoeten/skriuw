import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { commitOperations } from "../actions/workspace";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "../store/types";
import { textEdgeOffset, type DocumentEdge } from "./document-edges";
import { useDocumentEdgeShortcuts } from "./use-document-edge-shortcuts";
import { noteImageIds } from "./image-actions";
import {
  countRawMarkdownWords,
  rawMarkdownCursorStatus,
  rawMarkdownLineCount,
  rawMarkdownLineNumbers,
} from "./raw-markdown-editor-model";
import {
  reconcileRawMarkdown,
  updateRawMarkdown,
  type RawMarkdownState,
} from "./raw-markdown-reconciliation";
import { countWords, parseProductMarkdownWithImages } from "./schema";

const SAVE_DEBOUNCE_MS = 500;

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

function selectShowLineNumbers(state: RendererState): boolean {
  return state.settings.showLineNumbers === true;
}

export function RawMarkdownEditor({ store, selectNoteId }: Props) {
  const activeNoteId = useRendererSelector(store, selectNoteId);
  const showLineNumbers = useRendererSelector(store, selectShowLineNumbers);
  const selectRecord = useMemo(
    () =>
      (state: RendererState): DocumentRecord | undefined => {
        const noteId = selectNoteId(state);
        return noteId ? state.documents.get(noteId) : undefined;
      },
    [selectNoteId],
  );
  const record = useRendererSelector(store, selectRecord);
  const [source, setSource] = useState<RawMarkdownState>({
    noteId: activeNoteId,
    text: record?.markdown ?? "",
    dirty: false,
  });
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const deferredText = useDeferredValue(source.text);
  const saveTimerRef = useRef<number | null>(null);
  const lineNumberContentRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [shortcutHost, setShortcutHost] = useState<HTMLTextAreaElement | null>(null);
  const [cursorStatus, setCursorStatus] = useState(() => rawMarkdownCursorStatus(source.text, 0, 0));
  const wordCount = useMemo(() => countRawMarkdownWords(deferredText), [deferredText]);
  const lineCount = useMemo(() => rawMarkdownLineCount(deferredText), [deferredText]);
  const lineNumbers = useMemo(() => rawMarkdownLineNumbers(lineCount), [lineCount]);

  function saveNow(noteId: string, markdown: string): void {
    const current = store.getState().documents.get(noteId);
    if (!current) {
      return;
    }
    const document = parseProductMarkdownWithImages(
      markdown,
      noteImageIds(store.getState(), noteId),
    );
    void commitOperations(store, [
      {
        type: "save_document",
        noteId,
        documentJson: document.toJSON(),
        markdown,
        wordCount: countWords(document),
        expectedRevision: current.revision,
        at: Date.now(),
      },
    ]).catch((error) => {
      console.error("save rejected", error);
    });
  }

  function flushPendingSave(noteId: string | null): void {
    if (saveTimerRef.current === null || noteId === null) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    saveNow(noteId, sourceRef.current.text);
  }

  useEffect(() => {
    return () => flushPendingSave(sourceRef.current.noteId);
  }, []);

  useEffect(() => {
    const previous = sourceRef.current;
    const noteChanged = previous.noteId !== activeNoteId;
    if (noteChanged) {
      flushPendingSave(previous.noteId);
    }
    const next = reconcileRawMarkdown(
      previous,
      activeNoteId,
      record?.markdown ?? "",
    );
    if (next !== previous) {
      sourceRef.current = next;
      setSource(next);
    }
    if (noteChanged) {
      setCursorStatus(rawMarkdownCursorStatus(record?.markdown ?? "", 0, 0));
    }
  }, [activeNoteId, record?.markdown, record?.revision]);

  function handleChange(value: string): void {
    const next = updateRawMarkdown(sourceRef.current, value);
    sourceRef.current = next;
    setSource(next);
    const noteId = next.noteId;
    if (noteId === null) {
      return;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveNow(noteId, sourceRef.current.text);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleSelection(target: HTMLTextAreaElement): void {
    setCursorStatus(rawMarkdownCursorStatus(target.value, target.selectionStart, target.selectionEnd));
  }

  function handleScroll(target: HTMLTextAreaElement): void {
    if (lineNumberContentRef.current) {
      lineNumberContentRef.current.style.transform = `translateY(${-target.scrollTop}px)`;
    }
  }

  const jumpToDocumentEdge = useCallback((edge: DocumentEdge) => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    const offset = textEdgeOffset(textarea.value, edge);
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = edge === "start" ? 0 : textarea.scrollHeight;
    handleScroll(textarea);
    setCursorStatus(rawMarkdownCursorStatus(textarea.value, offset, offset));
  }, []);
  useDocumentEdgeShortcuts(store, shortcutHost, jumpToDocumentEdge);

  const selectionSummary = cursorStatus.selectedCharacters > 0
    ? `${cursorStatus.selectedWords} words · ${cursorStatus.selectedCharacters} chars selected`
    : `Ln ${cursorStatus.line}, Col ${cursorStatus.column}`;

  return (
    <div>
      <div className="relative min-h-[60vh]">
        {showLineNumbers ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-12 overflow-hidden border-r border-border/60 text-right font-mono text-[0.9rem] leading-[1.7] text-muted-foreground/70 select-none"
          >
            <pre ref={lineNumberContentRef} className="m-0 pr-3 font-mono text-[0.9rem] leading-[1.7] will-change-transform">
              {lineNumbers}
            </pre>
          </div>
        ) : null}
        <textarea
          ref={(node) => {
            textareaRef.current = node;
            setShortcutHost(node);
          }}
          className={`raw-markdown-editor block min-h-[60vh] whitespace-pre ${showLineNumbers ? "pl-14" : ""}`}
          aria-label="Raw Markdown source"
          wrap="off"
          value={source.text}
          spellCheck={false}
          onChange={(event) => handleChange(event.currentTarget.value)}
          onSelect={(event) => handleSelection(event.currentTarget)}
          onScroll={(event) => handleScroll(event.currentTarget)}
        />
      </div>
      <div
        className="mt-2 flex min-h-6 items-center justify-between border-t border-border/60 pt-2 font-mono text-[11px] tracking-tight text-muted-foreground"
        aria-label={`${wordCount} words, ${selectionSummary}`}
      >
        <span>{wordCount} words</span>
        <span>{selectionSummary}</span>
      </div>
    </div>
  );
}
