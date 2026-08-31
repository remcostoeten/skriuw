import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { commitOperations } from "@/store/actions/workspace";
import { registerPendingWork } from "@/shell/pending-work";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "@/store/types";
import { textEdgeOffset, type DocumentEdge } from "./document-edges";
import { JumpToLinePanel } from "./jump-to-line-panel";
import { useEditorBoundShortcuts } from "./use-editor-bound-shortcuts";
import type { EditorBoundHandlersFor } from "./use-editor-bound-shortcuts";
import type {
  RawMarkdownEdgeShortcutId,
  RawMarkdownSurfaceShortcutId,
} from "./editor-bound-shortcut-ids";
import { noteImageIds } from "./image-actions";
import {
  countRawMarkdownWords,
  parseJumpToLineInput,
  rawMarkdownCursorStatus,
  rawMarkdownLineCount,
  rawMarkdownLineNumbers,
  rawMarkdownLineOffset,
  rawMarkdownLineScrollTop,
} from "./raw-markdown-editor-model";
import {
  highlightRawMarkdown,
  type RawMarkdownHighlight,
  type RawMarkdownToken,
} from "./raw-markdown-highlight";
import {
  reconcileRawMarkdown,
  updateRawMarkdown,
  type RawMarkdownState,
} from "./raw-markdown-reconciliation";
import { countWords, parseProductMarkdownWithImages } from "./schema";
import { SaveFailureBanner } from "./save-failure-banner";
import { SaveSequencer } from "./save-sequencer";

const SAVE_DEBOUNCE_MS = 500;
const MARKDOWN_SCOPES = ["markdown"];
/**
 * Highlighting walks the whole source on every keystroke. Past this size the
 * overlay is dropped and the textarea paints its own text, which keeps very
 * large imported notes typeable instead of trading correctness for colour.
 */
const HIGHLIGHT_CHARACTER_LIMIT = 200_000;

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

function selectShowLineNumbers(state: RendererState): boolean {
  return state.settings.showLineNumbers === true;
}

function renderToken(token: RawMarkdownToken, index: number) {
  if (token.kind === null) {
    return token.text;
  }
  return (
    <span key={index} className={`raw-markdown-token-${token.kind}`}>
      {token.text}
    </span>
  );
}

function HighlightedSource({ highlight }: { highlight: RawMarkdownHighlight }) {
  return (
    <>
      {highlight.map((line, index) => (
        <span key={index} className="raw-markdown-line">
          {line.map(renderToken)}
        </span>
      ))}
    </>
  );
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
  const savingNoteIdsRef = useRef(new Set<string>());
  const draftsByNoteIdRef = useRef(new Map<string, string>());
  const [failedSaveNoteIds, setFailedSaveNoteIds] = useState<ReadonlySet<string>>(new Set());
  const saveSequencerRef = useRef<SaveSequencer | null>(null);
  if (saveSequencerRef.current === null) {
    saveSequencerRef.current = new SaveSequencer((failures) => {
      setFailedSaveNoteIds(new Set(failures.map(({ noteId }) => noteId)));
    });
  }
  const lineNumberContentRef = useRef<HTMLDivElement>(null);
  const overlayScrollerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const [textareaHost, setTextareaHost] = useState<HTMLTextAreaElement | null>(null);
  // A stable callback keeps React from detaching and reattaching the ref on
  // every render; an inline closure here re-runs setState per commit, which
  // loops once anything else blocks the same-state render bailout.
  const adoptTextarea = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    setTextareaHost(node);
  }, []);
  const [surfaceHost, setSurfaceHost] = useState<HTMLDivElement | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const jumpOpenRef = useRef(jumpOpen);
  jumpOpenRef.current = jumpOpen;
  const jumpFieldId = useId();
  const [cursorStatus, setCursorStatus] = useState(() => rawMarkdownCursorStatus(source.text, 0, 0));
  const wordCount = useMemo(() => countRawMarkdownWords(deferredText), [deferredText]);
  // Line-derived chrome tracks the live text rather than the deferred copy: the
  // overlay paints what the caret sits on, so a frame of lag would show the
  // gutter and the active-line band drifting away from the cursor.
  const lineCount = rawMarkdownLineCount(source.text);
  const lineNumbers = useMemo(() => rawMarkdownLineNumbers(lineCount), [lineCount]);
  const highlighted = source.text.length <= HIGHLIGHT_CHARACTER_LIMIT;
  const highlight = useMemo(
    () => (highlighted ? highlightRawMarkdown(source.text) : null),
    [highlighted, source.text],
  );

  function persistMarkdown(noteId: string, markdown: string): Promise<void> {
    const current = store.getState().documents.get(noteId);
    if (!current) {
      return Promise.resolve();
    }
    const document = parseProductMarkdownWithImages(
      markdown,
      noteImageIds(store.getState(), noteId),
      current.documentJson,
    );
    savingNoteIdsRef.current.add(noteId);
    return commitOperations(store, [
      {
        type: "save_document",
        noteId,
        documentJson: document.toJSON(),
        markdown,
        wordCount: countWords(document),
        expectedRevision: current.revision,
        at: Date.now(),
      },
    ]).then(() => {
      const latest = sourceRef.current;
      if (latest.noteId === noteId && latest.text === markdown && latest.dirty) {
        const clean = { ...latest, dirty: false };
        sourceRef.current = clean;
        setSource(clean);
      }
    }).finally(() => {
      savingNoteIdsRef.current.delete(noteId);
    });
  }

  function saveNow(noteId: string, markdown: string): Promise<void> {
    draftsByNoteIdRef.current.set(noteId, markdown);
    return saveSequencerRef.current!
      .enqueue(noteId, () => persistMarkdown(noteId, markdown))
      .then(() => {
        if (draftsByNoteIdRef.current.get(noteId) === markdown) {
          draftsByNoteIdRef.current.delete(noteId);
        }
      });
  }

  function reportBackgroundSaveFailure(error: unknown): void {
    console.error("save rejected", error);
  }

  async function flushPendingSave(noteId: string | null): Promise<void> {
    if (saveTimerRef.current !== null && noteId !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await saveNow(noteId, sourceRef.current.text).catch(() => undefined);
    }
    await saveSequencerRef.current!.flush();
  }

  useEffect(() => {
    const unregister = registerPendingWork(() => flushPendingSave(sourceRef.current.noteId));
    return () => {
      // The final save must stay registered until it settles so that a
      // flushPendingWork() issued right after unmount (restore, window close)
      // still waits for it instead of reading a pre-save revision.
      const finalSave = flushPendingSave(sourceRef.current.noteId).catch(
        reportBackgroundSaveFailure,
      );
      void finalSave.finally(unregister);
    };
  }, []);

  useEffect(
    () =>
      store.subscribe(
        (state) => state.nodes,
        () => {
          const available = store.getState().nodes;
          const sequencer = saveSequencerRef.current!;
          for (const noteId of draftsByNoteIdRef.current.keys()) {
            if (available.has(noteId)) continue;
            draftsByNoteIdRef.current.delete(noteId);
            sequencer.discard(noteId);
          }
        },
      ),
    [store],
  );

  useEffect(() => {
    const previous = sourceRef.current;
    const noteChanged = previous.noteId !== activeNoteId;
    if (noteChanged) {
      void flushPendingSave(previous.noteId).catch(reportBackgroundSaveFailure);
    }
    const next =
      !noteChanged && previous.dirty && previous.noteId !== null && savingNoteIdsRef.current.has(previous.noteId)
        ? previous
        : reconcileRawMarkdown(previous, activeNoteId, record?.markdown ?? "");
    if (next !== previous) {
      sourceRef.current = next;
      setSource(next);
    }
    if (noteChanged) {
      setCursorStatus(rawMarkdownCursorStatus(record?.markdown ?? "", 0, 0));
      const textarea = textareaRef.current;
      if (textarea !== null) {
        textarea.scrollTo(0, 0);
        handleScroll(textarea);
      }
    }
  }, [activeNoteId, record?.markdown, record?.revision]);

  function handleChange(target: HTMLTextAreaElement): void {
    const value = target.value;
    setCursorStatus(rawMarkdownCursorStatus(value, target.selectionStart, target.selectionEnd));
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
      void saveNow(noteId, sourceRef.current.text).catch(reportBackgroundSaveFailure);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleSelection(target: HTMLTextAreaElement): void {
    setCursorStatus(rawMarkdownCursorStatus(target.value, target.selectionStart, target.selectionEnd));
  }

  function handleScroll(target: HTMLTextAreaElement): void {
    const verticalOffset = `translateY(${-target.scrollTop}px)`;
    if (overlayScrollerRef.current) {
      overlayScrollerRef.current.style.transform = verticalOffset;
    }
    if (lineNumberContentRef.current) {
      lineNumberContentRef.current.style.transform = verticalOffset;
    }
    if (highlightRef.current) {
      highlightRef.current.style.transform = `translateX(${-target.scrollLeft}px)`;
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

  const closeJumpToLine = useCallback(() => {
    setJumpOpen(false);
    textareaRef.current?.focus();
  }, []);

  const toggleJumpToLine = useCallback(() => {
    if (jumpOpenRef.current) {
      closeJumpToLine();
      return;
    }
    setJumpOpen(true);
    requestAnimationFrame(() => {
      jumpInputRef.current?.focus();
      jumpInputRef.current?.select();
    });
  }, [closeJumpToLine]);

  const commitJumpToLine = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    const total = rawMarkdownLineCount(textarea.value);
    const line = parseJumpToLineInput(jumpValue, total);
    if (line === null) {
      return;
    }
    const offset = rawMarkdownLineOffset(textarea.value, line);
    setJumpOpen(false);
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = rawMarkdownLineScrollTop(
      line,
      total,
      textarea.scrollHeight,
      textarea.clientHeight,
    );
    handleScroll(textarea);
    setCursorStatus(rawMarkdownCursorStatus(textarea.value, offset, offset));
  }, [jumpValue]);

  const edgeShortcuts = useMemo<EditorBoundHandlersFor<RawMarkdownEdgeShortcutId>>(
    () => ({
      goToDocumentStart: () => jumpToDocumentEdge("start"),
      goToDocumentEnd: () => jumpToDocumentEdge("end"),
    }),
    [jumpToDocumentEdge],
  );
  const surfaceShortcuts = useMemo<EditorBoundHandlersFor<RawMarkdownSurfaceShortcutId>>(
    () => ({ jumpToLine: toggleJumpToLine }),
    [toggleJumpToLine],
  );
  useEditorBoundShortcuts(store, textareaHost, edgeShortcuts);
  useEditorBoundShortcuts(store, surfaceHost, surfaceShortcuts, MARKDOWN_SCOPES);

  function handleJumpKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitJumpToLine();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeJumpToLine();
    }
  }

  const selectionSummary = cursorStatus.selectedCharacters > 0
    ? `${cursorStatus.selectedWords} words · ${cursorStatus.selectedCharacters} chars selected`
    : `Ln ${cursorStatus.line}, Col ${cursorStatus.column}`;
  const editorPane = surfaceHost?.closest<HTMLElement>(".editor-pane") ?? null;

  return (
    <div ref={setSurfaceHost}>
      {failedSaveNoteIds.size > 0 && (
        <SaveFailureBanner
          message={
            failedSaveNoteIds.size === 1
              ? "Changes couldn’t be saved. Your Markdown draft is still here."
              : `Markdown changes in ${failedSaveNoteIds.size} notes couldn’t be saved. Your drafts are still here.`
          }
          onRetry={() => {
            const retries = [...failedSaveNoteIds].flatMap((noteId) => {
              const draft = draftsByNoteIdRef.current.get(noteId);
              return draft === undefined ? [] : [saveNow(noteId, draft)];
            });
            void Promise.all(retries).catch(reportBackgroundSaveFailure);
          }}
          getSurface={() => textareaRef.current}
        />
      )}
      {jumpOpen && editorPane
        ? createPortal(
            <div className="absolute right-3 top-3 z-40 rounded-lg border border-border bg-popover p-1.5 pl-2.5 text-[13px] text-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)]">
              <JumpToLinePanel
                fieldId={jumpFieldId}
                inputRef={jumpInputRef}
                value={jumpValue}
                onValueChange={setJumpValue}
                onKeyDown={handleJumpKeyDown}
                onBlur={() => setJumpOpen(false)}
                onClose={closeJumpToLine}
                lineCount={lineCount}
                placeholder={String(cursorStatus.line)}
              />
            </div>,
            editorPane,
          )
        : null}
      <div
        className="raw-markdown-root"
        data-line-numbers={showLineNumbers ? "true" : "false"}
        data-highlighted={highlight === null ? "false" : "true"}
      >
        <div className="raw-markdown-surface">
          {showLineNumbers ? (
            <div aria-hidden="true" className="raw-markdown-gutter">
              <div ref={lineNumberContentRef} className="raw-markdown-gutter-content">
                {lineNumbers.map((number) => (
                  <span
                    key={number}
                    className="raw-markdown-gutter-line"
                    data-active={number === cursorStatus.line ? "true" : "false"}
                  >
                    {number}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div aria-hidden="true" className="raw-markdown-overlay">
            <div ref={overlayScrollerRef} className="raw-markdown-scroller">
              <div
                className="raw-markdown-active-line"
                style={{
                  top: `calc(var(--raw-markdown-row) * ${cursorStatus.line - 1})`,
                }}
              />
              {highlight === null ? null : (
                <pre ref={highlightRef} className="raw-markdown-highlight">
                  <HighlightedSource highlight={highlight} />
                </pre>
              )}
            </div>
          </div>
          <textarea
            ref={adoptTextarea}
            className="raw-markdown-editor"
            aria-label="Raw Markdown source"
            wrap="off"
            value={source.text}
            spellCheck={false}
            onChange={(event) => handleChange(event.currentTarget)}
            onSelect={(event) => handleSelection(event.currentTarget)}
            onScroll={(event) => handleScroll(event.currentTarget)}
          />
        </div>
        <div className="raw-markdown-status" aria-label={`${wordCount} words, ${selectionSummary}`}>
          <span>{wordCount} words</span>
          <span>{selectionSummary}</span>
        </div>
      </div>
    </div>
  );
}
