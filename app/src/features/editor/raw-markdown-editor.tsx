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
import { commitOperations } from "@/store/actions/workspace";
import { registerPendingWork } from "@/shell/pending-work";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "@/store/types";
import { textEdgeOffset, type DocumentEdge } from "./document-edges";
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
  reconcileRawMarkdown,
  updateRawMarkdown,
  type RawMarkdownState,
} from "./raw-markdown-reconciliation";
import { countWords, parseProductMarkdownWithImages } from "./schema";
import { SaveSequencer } from "./save-sequencer";

const SAVE_DEBOUNCE_MS = 500;
const MARKDOWN_SCOPES = ["markdown"];

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
  const savingNoteIdsRef = useRef(new Set<string>());
  const draftsByNoteIdRef = useRef(new Map<string, string>());
  const [failedSaveNoteIds, setFailedSaveNoteIds] = useState<ReadonlySet<string>>(new Set());
  const saveSequencerRef = useRef<SaveSequencer | null>(null);
  if (saveSequencerRef.current === null) {
    saveSequencerRef.current = new SaveSequencer((failures) => {
      setFailedSaveNoteIds(new Set(failures.map(({ noteId }) => noteId)));
    });
  }
  const lineNumberContentRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const [textareaHost, setTextareaHost] = useState<HTMLTextAreaElement | null>(null);
  const [surfaceHost, setSurfaceHost] = useState<HTMLDivElement | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const jumpOpenRef = useRef(jumpOpen);
  jumpOpenRef.current = jumpOpen;
  const jumpFieldId = useId();
  const [cursorStatus, setCursorStatus] = useState(() => rawMarkdownCursorStatus(source.text, 0, 0));
  const wordCount = useMemo(() => countRawMarkdownWords(deferredText), [deferredText]);
  const lineCount = useMemo(() => rawMarkdownLineCount(deferredText), [deferredText]);
  const lineNumbers = useMemo(() => rawMarkdownLineNumbers(lineCount), [lineCount]);

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
      unregister();
      void flushPendingSave(sourceRef.current.noteId).catch(reportBackgroundSaveFailure);
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
      void saveNow(noteId, sourceRef.current.text).catch(reportBackgroundSaveFailure);
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

  return (
    <div ref={setSurfaceHost}>
      {failedSaveNoteIds.size > 0 && (
        <div
          className="sticky top-3 z-40 mx-auto mb-3 flex max-w-xl items-center justify-between gap-4 rounded-[var(--radius)] border border-[hsl(var(--mood-rough)/0.45)] bg-popover px-3 py-2 text-[13px] shadow-sm"
          role="alert"
        >
          <span>
            {failedSaveNoteIds.size === 1
              ? "Changes couldn’t be saved. Your Markdown draft is still here."
              : `Markdown changes in ${failedSaveNoteIds.size} notes couldn’t be saved. Your drafts are still here.`}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-[var(--radius)] border border-border bg-muted/55 px-2 py-1 text-[12px] font-[560] hover:bg-muted"
            onClick={() => {
              const retries = [...failedSaveNoteIds].flatMap((noteId) => {
                const draft = draftsByNoteIdRef.current.get(noteId);
                return draft === undefined ? [] : [saveNow(noteId, draft)];
              });
              void Promise.all(retries).catch(reportBackgroundSaveFailure);
            }}
          >
            Retry save
          </button>
        </div>
      )}
      {jumpOpen ? (
        <div className="sticky top-3 z-40 flex h-0 items-start justify-end">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-popover p-1.5 pl-2.5 text-[13px] text-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)]">
            <label htmlFor={jumpFieldId} className="text-muted-foreground">
              Line
            </label>
            <div className="flex items-center rounded-md border border-border bg-background px-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring">
              <input
                id={jumpFieldId}
                ref={jumpInputRef}
                value={jumpValue}
                onChange={(event) => setJumpValue(event.target.value)}
                onKeyDown={handleJumpKeyDown}
                onBlur={() => setJumpOpen(false)}
                inputMode="numeric"
                placeholder={String(cursorStatus.line)}
                aria-label={`Jump to line, 1 to ${lineCount}`}
                spellCheck={false}
                className="w-16 bg-transparent py-1 text-[13px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <span className="pr-1 text-xs tabular-nums text-muted-foreground">
              of {lineCount}
            </span>
          </div>
        </div>
      ) : null}
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
            setTextareaHost(node);
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
