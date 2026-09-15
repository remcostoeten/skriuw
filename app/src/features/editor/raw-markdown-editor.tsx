import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
import { commitOperations } from "@/store/actions/workspace";
import { setEditorMode } from "@/store/actions/editor-mode";
import { registerPendingWork } from "@/shell/pending-work";
import { usesVimMode } from "@/features/settings/settings-model";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "@/store/types";
import type { DocumentEdge } from "./document-edges";
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
} from "./raw-markdown-editor-model";
import {
  reconcileRawMarkdown,
  updateRawMarkdown,
  type RawMarkdownState,
} from "./raw-markdown-reconciliation";
import { rawMarkdownSyntax } from "./raw-markdown-syntax";
import {
  bindRawMarkdownVimHandlers,
  observeRawMarkdownVimMode,
  rawMarkdownVim,
  type RawMarkdownVimMode,
} from "./raw-markdown-vim";
import {
  jumpToRawMarkdownRow,
  rawMarkdownRowLayout,
  rawMarkdownRowNumbers,
  rawMarkdownRowStatus,
  type RawMarkdownRowStatus,
} from "./raw-markdown-rows";
import { countWords, parseProductMarkdownWithImages } from "./schema";
import { SaveFailureBanner } from "./save-failure-banner";
import { SaveSequencer } from "./save-sequencer";
import { toastActionIsAvailable } from "@/shared/ui/toast";

const SAVE_DEBOUNCE_MS = 500;
const MARKDOWN_SCOPES = ["markdown"];

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

function selectShowLineNumbers(state: RendererState): boolean {
  return state.settings.showLineNumbers === true;
}

function selectVimMode(state: RendererState): boolean {
  return usesVimMode(state.settings);
}

function selectEditorPlaceholder(state: RendererState): string {
  return state.settings.editorPlaceholder;
}

/** Marks document replacements driven by the store, which must never schedule a save. */
const externalChange = Annotation.define<boolean>();

function lineNumbersExtension(enabled: boolean): Extension {
  return enabled ? rawMarkdownRowNumbers() : [];
}

function vimExtension(enabled: boolean): Extension {
  return enabled ? rawMarkdownVim() : [];
}

function replaceDocument(view: EditorView, text: string, resetCursor: boolean): void {
  const current = view.state.doc.toString();
  if (current === text && !resetCursor) return;
  view.dispatch({
    changes: current === text ? undefined : { from: 0, to: current.length, insert: text },
    selection: resetCursor ? { anchor: 0 } : undefined,
    scrollIntoView: resetCursor,
    annotations: externalChange.of(true),
  });
  if (resetCursor) view.scrollDOM.scrollTo(0, 0);
}

export function RawMarkdownEditor({ store, selectNoteId }: Props) {
  const activeNoteId = useRendererSelector(store, selectNoteId);
  const showLineNumbers = useRendererSelector(store, selectShowLineNumbers);
  const vimEnabled = useRendererSelector(store, selectVimMode);
  const editorPlaceholder = useRendererSelector(store, selectEditorPlaceholder);
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
  const viewRef = useRef<EditorView | null>(null);
  const lineNumbersCompartmentRef = useRef(new Compartment());
  const vimCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const [contentHost, setContentHost] = useState<HTMLElement | null>(null);
  const [surfaceHost, setSurfaceHost] = useState<HTMLDivElement | null>(null);
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const jumpOpenRef = useRef(jumpOpen);
  jumpOpenRef.current = jumpOpen;
  const jumpFieldId = useId();
  const [cursorStatus, setCursorStatus] = useState(() => rawMarkdownCursorStatus(source.text, 0, 0));
  const [vimMode, setVimMode] = useState<RawMarkdownVimMode | null>(null);
  const [rowStatus, setRowStatus] = useState<RawMarkdownRowStatus | null>(null);
  const wordCount = useMemo(() => countRawMarkdownWords(deferredText), [deferredText]);
  const rowCount = rowStatus?.rowCount ?? rawMarkdownLineCount(source.text);
  const cursorRow = rowStatus?.row ?? cursorStatus.line;

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

  const handleChangeRef = useRef(handleChange);
  handleChangeRef.current = handleChange;

  useEffect(() => {
    if (editorHost === null) {
      return;
    }
    const view = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: sourceRef.current.text,
        extensions: [
          vimCompartmentRef.current.of(vimExtension(usesVimMode(store.getState().settings))),
          rawMarkdownRowLayout(),
          lineNumbersCompartmentRef.current.of(
            lineNumbersExtension(store.getState().settings.showLineNumbers === true),
          ),
          placeholderCompartmentRef.current.of(
            placeholder(store.getState().settings.editorPlaceholder),
          ),
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            spellcheck: "false",
            "aria-label": "Raw Markdown source",
          }),
          rawMarkdownSyntax(),
          keymap.of([
            {
              key: "Mod-Shift-z",
              run: () => toastActionIsAvailable(),
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some(
              (transaction) => transaction.annotation(externalChange) === true,
            );
            if (update.docChanged && !external) {
              handleChangeRef.current(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              const { from, to } = update.state.selection.main;
              setCursorStatus(rawMarkdownCursorStatus(update.state.doc.toString(), from, to));
            }
            const rows = rawMarkdownRowStatus(update.view);
            setRowStatus((previous) =>
              previous?.row === rows.row && previous.rowCount === rows.rowCount ? previous : rows,
            );
          }),
        ],
      }),
    });
    viewRef.current = view;
    setContentHost(view.contentDOM);
    return () => {
      setContentHost(null);
      viewRef.current = null;
      view.destroy();
    };
  }, [editorHost, store]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumbersCompartmentRef.current.reconfigure(lineNumbersExtension(showLineNumbers)),
    });
  }, [showLineNumbers, contentHost]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartmentRef.current.reconfigure(placeholder(editorPlaceholder)),
    });
  }, [editorPlaceholder, contentHost]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartmentRef.current.reconfigure(vimExtension(vimEnabled)),
    });
    if (!vimEnabled) {
      setVimMode(null);
      return;
    }
    const unbind = bindRawMarkdownVimHandlers(view, {
      write: () => {
        const noteId = sourceRef.current.noteId;
        if (noteId === null) return;
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void saveNow(noteId, sourceRef.current.text).catch(reportBackgroundSaveFailure);
      },
      quit: () => {
        const noteId = sourceRef.current.noteId;
        if (noteId === null) return;
        setEditorMode(store, noteId, "rendered");
      },
    });
    const unobserve = observeRawMarkdownVimMode(view, setVimMode);
    return () => {
      unobserve();
      unbind();
    };
  }, [vimEnabled, contentHost, store]);

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
    const view = viewRef.current;
    if (view) {
      replaceDocument(view, next.text, noteChanged);
    }
    if (noteChanged) {
      setCursorStatus(rawMarkdownCursorStatus(next.text, 0, 0));
    }
  }, [activeNoteId, record?.markdown, record?.revision, contentHost]);

  const jumpToDocumentEdge = useCallback((edge: DocumentEdge) => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const offset = edge === "start" ? 0 : view.state.doc.length;
    view.focus();
    view.dispatch({
      selection: { anchor: offset },
      effects: EditorView.scrollIntoView(offset, { y: edge === "start" ? "start" : "end" }),
    });
  }, []);

  const closeJumpToLine = useCallback(() => {
    setJumpOpen(false);
    viewRef.current?.focus();
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
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const row = parseJumpToLineInput(jumpValue, rawMarkdownRowStatus(view).rowCount);
    if (row === null) {
      return;
    }
    setJumpOpen(false);
    view.focus();
    jumpToRawMarkdownRow(view, row);
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
  useEditorBoundShortcuts(store, contentHost, edgeShortcuts);
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
    : `Ln ${cursorRow}, Col ${cursorStatus.column}`;
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
          getSurface={() => viewRef.current?.contentDOM ?? null}
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
                lineCount={rowCount}
                placeholder={String(cursorRow)}
              />
            </div>,
            editorPane,
          )
        : null}
      <div
        className="raw-markdown-root"
        data-line-numbers={showLineNumbers ? "true" : "false"}
        data-vim-mode={vimMode ?? "off"}
        style={{ "--raw-markdown-digits": Math.max(2, String(rowCount).length) } as CSSProperties}
      >
        <div ref={setEditorHost} className="raw-markdown-surface" />
        <div className="raw-markdown-status" aria-label={`${wordCount} words, ${selectionSummary}`}>
          <span>{wordCount} words</span>
          <span className="raw-markdown-status-end">
            {vimMode ? <span className="vim-mode-badge" data-mode={vimMode}>{vimMode}</span> : null}
            <span>{selectionSummary}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
