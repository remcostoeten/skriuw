import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  AllSelection,
  EditorState,
  TextSelection,
  type Plugin,
  type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createMentionPlugin, type MentionContext } from "../references/mention-plugin";
import { createReferenceNodeViews } from "../references/reference-nodeview";
import { commitOperations, commitReferenceOperations } from "../actions/workspace";
import { cssStringLiteral } from "../settings/apply-settings";
import { projectSettings } from "../settings/settings-model";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { DocumentRecord, RendererStore } from "../store/types";
import {
  BOUNDED_BLOCK_LIMIT,
  createBoundedDocument,
  shouldUseBoundedEditor,
  topLevelBlockAtPosition,
  topLevelTextPosition,
  type BoundedDocument,
} from "./bounded-document";
import {
  countWords,
  createProductPlugins,
  productSchema,
  serializeProductMarkdown,
  slashMenuState,
} from "./schema";
import {
  createSearchPlugin,
  getSearchState,
  searchPluginKey,
  setSearch,
  type EditorSearchTarget,
} from "./search-plugin";
import { applySlashCommand, filterSlashCommands } from "./slash-commands";
import { SearchWidget } from "./search-widget";
import { useEditorSearch } from "./use-editor-search";

const SAVE_DEBOUNCE_MS = 500;
const VIRTUAL_BLOCK_HEIGHT = 32;
const WINDOW_SHIFT = Math.floor(BOUNDED_BLOCK_LIMIT / 2);

type Props = {
  store: RendererStore;
};

type CachedNote = {
  state: EditorState;
  revision: number;
  bounded: BoundedDocument | null;
  searchState: EditorState | null;
  scrollTop: number;
  wholeSelected: boolean;
};

type SlashMenu = {
  open: boolean;
  query: string;
  index: number;
  x: number;
  y: number;
};

const closedSlashMenu: SlashMenu = { open: false, query: "", index: 0, x: 0, y: 0 };

function emptyDocument(): ProseMirrorNode {
  return productSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] });
}

function createEditorState(
  document: ProseMirrorNode,
  extraPlugins: readonly Plugin[] = [],
): EditorState {
  return EditorState.create({
    doc: document,
    plugins: [...createProductPlugins(), ...extraPlugins],
  });
}

function createSearchState(document: ProseMirrorNode): EditorState {
  return EditorState.create({ doc: document, plugins: [createSearchPlugin()] });
}

function documentFromJson(json: unknown): ProseMirrorNode {
  try {
    return productSchema.nodeFromJSON(json);
  } catch {
    return emptyDocument();
  }
}

function createCachedNote(
  record: DocumentRecord,
  extraPlugins: readonly Plugin[],
): CachedNote {
  const document = documentFromJson(record.documentJson);
  const bounded = shouldUseBoundedEditor(document) ? createBoundedDocument(document) : null;
  return {
    state: createEditorState(bounded?.windowDocument() ?? document, extraPlugins),
    revision: record.revision,
    bounded,
    searchState: bounded ? createSearchState(document) : null,
    scrollTop: 0,
    wholeSelected: false,
  };
}

function documentsEqual(left: ProseMirrorNode, json: unknown): boolean {
  try {
    return left.eq(productSchema.nodeFromJSON(json));
  } catch {
    return false;
  }
}

function readSelection(state: EditorState, windowStart: number) {
  return {
    blockIndex: windowStart + state.selection.$from.index(0),
    offset: state.selection.$from.parentOffset,
  };
}

function fullDocumentText(document: ProseMirrorNode): string {
  return document.textBetween(0, document.content.size, "\n\n");
}

function fullDocumentHtml(document: ProseMirrorNode): string {
  const container = window.document.createElement("div");
  container.append(DOMSerializer.fromSchema(productSchema).serializeFragment(document.content));
  return container.innerHTML;
}

export function NoteEditor({ store }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const beforeSpacerRef = useRef<HTMLDivElement>(null);
  const afterSpacerRef = useRef<HTMLDivElement>(null);
  const accessibleDocumentRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cacheRef = useRef(new Map<string, CachedNote>());
  const activeIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  const pendingWindowRef = useRef<number | null>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const boundedSurfaceKeyRef = useRef("");
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(closedSlashMenu);
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const activeNoteId = useRendererSelector(store, (state) => state.activeNoteId);
  const settingsDocument = useRendererSelector(store, (state) => state.settings);
  const editorSettings = projectSettings(settingsDocument);
  const mentionPluginsRef = useRef<Plugin[] | null>(null);
  if (mentionPluginsRef.current === null) {
    const mentionContext: MentionContext = {
      getState: () => store.getState(),
      applyReferenceOperations: (operations) => {
        commitReferenceOperations(store, operations);
      },
    };
    mentionPluginsRef.current = [createMentionPlugin(mentionContext)];
  }
  const mentionPlugins = mentionPluginsRef.current;

  function activeEntry(): CachedNote | null {
    const noteId = activeIdRef.current;
    return noteId ? (cacheRef.current.get(noteId) ?? null) : null;
  }

  function syncBoundedSurface(entry: CachedNote): void {
    const bounded = entry.bounded;
    const view = viewRef.current;
    if (!bounded || !view) {
      boundedSurfaceKeyRef.current = "";
      beforeSpacerRef.current?.style.setProperty("height", "0px");
      afterSpacerRef.current?.style.setProperty("height", "0px");
      view?.dom.removeAttribute("aria-describedby");
      view?.dom.removeAttribute("aria-label");
      if (accessibleDocumentRef.current) {
        accessibleDocumentRef.current.disabled = true;
        accessibleDocumentRef.current.tabIndex = -1;
      }
      return;
    }
    const surfaceKey = `${bounded.windowStart()}:${bounded.windowEnd()}:${bounded.blockCount()}`;
    if (surfaceKey === boundedSurfaceKeyRef.current) return;
    boundedSurfaceKeyRef.current = surfaceKey;
    if (accessibleDocumentRef.current) {
      accessibleDocumentRef.current.disabled = false;
      accessibleDocumentRef.current.tabIndex = 0;
    }
    beforeSpacerRef.current?.style.setProperty(
      "height",
      `${bounded.windowStart() * VIRTUAL_BLOCK_HEIGHT}px`,
    );
    afterSpacerRef.current?.style.setProperty(
      "height",
      `${(bounded.blockCount() - bounded.windowEnd()) * VIRTUAL_BLOCK_HEIGHT}px`,
    );
    view.dom.setAttribute(
      "aria-label",
      `Note editor, blocks ${bounded.windowStart() + 1} through ${bounded.windowEnd()} of ${bounded.blockCount()}. Tab to read the full note.`,
    );
  }

  function rebuildBoundedSearchState(entry: CachedNote): void {
    const bounded = entry.bounded;
    if (!bounded) return;
    const previous = entry.searchState ? getSearchState({
      state: entry.searchState,
      dispatch: () => undefined,
      focus: () => undefined,
    }) : undefined;
    let state = createSearchState(bounded.fullDocument());
    if (previous?.term) {
      state = state.apply(
        state.tr.setMeta(searchPluginKey, {
          term: previous.term,
          options: previous.options,
          current: previous.current,
        }),
      );
    }
    entry.searchState = state;
  }

  function installBoundedWindow(
    entry: CachedNote,
    focus: boolean,
    rebuild = true,
  ): void {
    const bounded = entry.bounded;
    const view = viewRef.current;
    if (!bounded || !view) return;
    if (rebuild) {
      entry.state = createEditorState(bounded.windowDocument(), mentionPlugins);
      const remembered = bounded.selection();
      if (
        remembered &&
        remembered.blockIndex >= bounded.windowStart() &&
        remembered.blockIndex < bounded.windowEnd()
      ) {
        const position = topLevelTextPosition(
          entry.state.doc,
          remembered.blockIndex - bounded.windowStart(),
          remembered.offset,
        );
        entry.state = entry.state.apply(
          entry.state.tr.setSelection(TextSelection.create(entry.state.doc, position)),
        );
      }
    }
    view.updateState(entry.state);
    const searchState = entry.searchState ? getSearchState({
      state: entry.searchState,
      dispatch: () => undefined,
      focus: () => undefined,
    }) : undefined;
    if (searchState?.term) {
      setSearch(view, searchState.term, searchState.options);
      entry.state = view.state;
    }
    syncBoundedSurface(entry);
    if (focus) view.focus();
  }

  function moveBoundedWindow(entry: CachedNote, requestedStart: number): void {
    const bounded = entry.bounded;
    if (!bounded) return;
    if (composingRef.current) {
      pendingWindowRef.current = requestedStart;
      return;
    }
    const view = viewRef.current;
    if (view?.hasFocus()) {
      bounded.rememberSelection(readSelection(view.state, bounded.windowStart()));
    }
    if (bounded.moveWindow(requestedStart)) {
      installBoundedWindow(entry, view?.hasFocus() ?? false);
    }
  }

  function saveNow(noteId: string): void {
    const cached = cacheRef.current.get(noteId);
    const record = store.getState().documents.get(noteId);
    if (!cached || !record) return;
    const document = cached.bounded?.fullDocument() ?? cached.state.doc;
    void commitOperations(store, [
      {
        type: "save_document",
        noteId,
        documentJson: document.toJSON(),
        markdown: serializeProductMarkdown(document),
        wordCount: countWords(document),
        expectedRevision: record.revision,
        at: Date.now(),
      },
    ])
      .then(() => {
        const entry = cacheRef.current.get(noteId);
        const saved = store.getState().documents.get(noteId);
        if (entry && saved) entry.revision = saved.revision;
      })
      .catch((error) => {
        console.error("save rejected", error);
        cacheRef.current.delete(noteId);
      });
  }

  function flushPendingSave(): void {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (activeIdRef.current) saveNow(activeIdRef.current);
  }

  function schedulePendingSave(): void {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      if (activeIdRef.current) saveNow(activeIdRef.current);
    }, SAVE_DEBOUNCE_MS);
  }

  function dispatchTransaction(transaction: Transaction): void {
    const view = viewRef.current;
    const entry = activeEntry();
    if (!view || !entry) return;
    const next = view.state.apply(transaction);
    view.updateState(next);
    entry.state = next;
    if (entry.bounded) {
      entry.bounded.rememberSelection(readSelection(next, entry.bounded.windowStart()));
      const replaceWholeDocument = entry.wholeSelected && transaction.docChanged;
      if (transaction.selectionSet && !transaction.docChanged) {
        entry.wholeSelected = next.selection instanceof AllSelection;
      }
      if (transaction.docChanged) {
        if (replaceWholeDocument) {
          entry.bounded.replaceFullDocument(next.doc, Date.now());
        } else {
          entry.bounded.replaceWindow(next.doc, Date.now());
        }
        entry.wholeSelected = false;
        if (searchRef.current.searchOpen) rebuildBoundedSearchState(entry);
        else entry.searchState = null;
        syncBoundedSurface(entry);
      }
    }
    if (transaction.docChanged) schedulePendingSave();
    if (transaction.docChanged && searchRef.current.searchOpen) {
      searchRef.current.syncMatchInfo();
    }
    const menu = slashMenuState(next);
    if (!menu.open) {
      if (slashMenuRef.current.open) setSlashMenu(closedSlashMenu);
      return;
    }
    const coords = view.coordsAtPos(next.selection.from);
    setSlashMenu((previous) => ({
      open: true,
      query: menu.query,
      index: previous.query === menu.query ? previous.index : 0,
      x: coords.left,
      y: coords.bottom + 4,
    }));
  }

  function getSearchTarget(): EditorSearchTarget | null {
    const view = viewRef.current;
    const entry = activeEntry();
    if (!view || !entry?.bounded) return view;
    if (!entry.searchState) rebuildBoundedSearchState(entry);
    if (!entry.searchState) return view;
    return {
      get state() {
        return entry.searchState as EditorState;
      },
      dispatch(transaction) {
        const current = entry.searchState;
        if (!current) return;
        entry.searchState = current.apply(transaction);
        if (transaction.docChanged) {
          entry.bounded?.replaceFullDocument(entry.searchState.doc, Date.now());
          installBoundedWindow(entry, true);
          schedulePendingSave();
        } else {
          const searchState = getSearchState(this);
          if (searchState) {
            setSearch(view, searchState.term, searchState.options);
            entry.state = view.state;
          }
        }
      },
      focus: () => view.focus(),
      revealPosition(position) {
        const bounded = entry.bounded;
        if (!bounded) return;
        const block = topLevelBlockAtPosition(bounded.fullDocument(), position);
        if (bounded.revealBlock(block)) installBoundedWindow(entry, true);
      },
    };
  }

  const getEditorSearchTarget = useCallback(() => getSearchTarget(), []);
  const search = useEditorSearch(store, getEditorSearchTarget);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const referenceViews = createReferenceNodeViews(store);
    const view = new EditorView(host, {
      state: createEditorState(emptyDocument(), mentionPlugins),
      editable: () => activeIdRef.current !== null,
      nodeViews: referenceViews.nodeViews,
      dispatchTransaction,
      handleKeyDown(currentView, event) {
        const entry = activeEntry();
        const bounded = entry?.bounded;
        const mod = event.metaKey || event.ctrlKey;
        if (entry && bounded && mod && event.key.toLowerCase() === "a") {
          entry.wholeSelected = true;
          currentView.dispatch(
            currentView.state.tr.setSelection(new AllSelection(currentView.state.doc)),
          );
          return true;
        }
        if (entry && bounded && mod && event.key.toLowerCase() === "z") {
          const changed = event.shiftKey ? bounded.redo() : bounded.undo();
          if (changed) {
            rebuildBoundedSearchState(entry);
            installBoundedWindow(entry, true);
            schedulePendingSave();
          }
          return changed;
        }
        if (entry && bounded && !mod && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          const selection = readSelection(currentView.state, bounded.windowStart());
          const atEnd =
            event.key === "ArrowDown" && selection.blockIndex >= bounded.windowEnd() - 1;
          const atStart = event.key === "ArrowUp" && selection.blockIndex <= bounded.windowStart();
          if (atEnd || atStart) {
            moveBoundedWindow(
              entry,
              bounded.windowStart() + (atEnd ? WINDOW_SHIFT : -WINDOW_SHIFT),
            );
            return true;
          }
        }
        const menu = slashMenuRef.current;
        if (!menu.open) return false;
        const commands = filterSlashCommands(menu.query);
        if (commands.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setSlashMenu((previous) => ({
            ...previous,
            index: (previous.index + direction + commands.length) % commands.length,
          }));
          return true;
        }
        if (event.key === "Enter") {
          const command = commands[menu.index % commands.length];
          if (command) applySlashCommand(currentView, command);
          setSlashMenu(closedSlashMenu);
          return true;
        }
        if (event.key === "Escape") {
          setSlashMenu(closedSlashMenu);
          return true;
        }
        return false;
      },
    });
    viewRef.current = view;
    const scrollHost = host.closest<HTMLElement>(".editor-scroll");
    scrollHostRef.current = scrollHost;
    const handleScroll = () => {
      const entry = activeEntry();
      if (!entry?.bounded || !scrollHost) return;
      entry.scrollTop = scrollHost.scrollTop;
      const target = Math.floor(scrollHost.scrollTop / VIRTUAL_BLOCK_HEIGHT) - WINDOW_SHIFT;
      if (Math.abs(target - entry.bounded.windowStart()) >= WINDOW_SHIFT) {
        moveBoundedWindow(entry, target);
      }
    };
    const handleCompositionStart = () => {
      composingRef.current = true;
    };
    const handleCompositionEnd = () => {
      composingRef.current = false;
      const pending = pendingWindowRef.current;
      pendingWindowRef.current = null;
      const entry = activeEntry();
      if (entry && pending !== null) moveBoundedWindow(entry, pending);
    };
    const handleCopy = (event: ClipboardEvent) => {
      const entry = activeEntry();
      const bounded = entry?.bounded;
      if (!entry?.wholeSelected || !bounded || !event.clipboardData) return;
      const document = bounded.fullDocument();
      event.preventDefault();
      event.clipboardData.setData("text/plain", fullDocumentText(document));
      event.clipboardData.setData("text/html", fullDocumentHtml(document));
    };
    scrollHost?.addEventListener("scroll", handleScroll, { passive: true });
    view.dom.addEventListener("compositionstart", handleCompositionStart);
    view.dom.addEventListener("compositionend", handleCompositionEnd);
    view.dom.addEventListener("copy", handleCopy);
    return () => {
      flushPendingSave();
      scrollHost?.removeEventListener("scroll", handleScroll);
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("copy", handleCopy);
      viewRef.current = null;
      view.destroy();
      referenceViews.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    searchRef.current.resetSearch();
    flushPendingSave();
    const previous = activeEntry();
    if (previous?.bounded && view.hasFocus()) {
      previous.bounded.rememberSelection(
        readSelection(view.state, previous.bounded.windowStart()),
      );
    }
    if (previous && scrollHostRef.current) previous.scrollTop = scrollHostRef.current.scrollTop;
    activeIdRef.current = activeNoteId;
    setSlashMenu(closedSlashMenu);
    if (activeNoteId === null) {
      view.updateState(createEditorState(emptyDocument(), mentionPlugins));
      syncBoundedSurface({
        state: view.state,
        revision: 0,
        bounded: null,
        searchState: null,
        scrollTop: 0,
        wholeSelected: false,
      });
      return;
    }
    const record = store.getState().documents.get(activeNoteId);
    if (!record) {
      view.updateState(createEditorState(emptyDocument(), mentionPlugins));
      return;
    }
    let entry = cacheRef.current.get(activeNoteId);
    if (!entry || (entry.revision !== record.revision && !documentsEqual(
      entry.bounded?.fullDocument() ?? entry.state.doc,
      record.documentJson,
    ))) {
      entry = createCachedNote(record, mentionPlugins);
      cacheRef.current.set(activeNoteId, entry);
    } else {
      entry.revision = record.revision;
    }
    if (entry.bounded) {
      installBoundedWindow(entry, false, false);
    } else {
      view.updateState(entry.state);
      syncBoundedSurface(entry);
    }
    if (scrollHostRef.current) scrollHostRef.current.scrollTop = entry.scrollTop;
    view.focus();
  }, [activeNoteId, store]);

  useEffect(
    () =>
      store.subscribe(
        (state) => state.documents,
        () => {
          const id = activeIdRef.current;
          const record = id ? store.getState().documents.get(id) : undefined;
          const entry = id ? cacheRef.current.get(id) : undefined;
          if (!record || !entry) return;
          const current = entry.bounded?.fullDocument() ?? entry.state.doc;
          if (documentsEqual(current, record.documentJson)) {
            entry.revision = record.revision;
            return;
          }
          const replacement = documentFromJson(record.documentJson);
          entry.revision = record.revision;
          entry.wholeSelected = false;
          if (shouldUseBoundedEditor(replacement)) {
            if (entry.bounded) entry.bounded.reconcile(replacement);
            else entry.bounded = createBoundedDocument(replacement);
            rebuildBoundedSearchState(entry);
            installBoundedWindow(entry, false);
          } else {
            entry.bounded = null;
            entry.searchState = null;
            entry.state = createEditorState(replacement, mentionPlugins);
            viewRef.current?.updateState(entry.state);
            syncBoundedSurface(entry);
          }
        },
      ),
    [store],
  );

  const slashItems = slashMenu.open ? filterSlashCommands(slashMenu.query) : [];

  return (
    <div className="editor-host">
      {search.searchOpen && (
        <div className="editor-search-anchor">
          <SearchWidget
            ref={search.findInputRef}
            query={search.searchQuery}
            onQueryChange={search.setSearchQuery}
            replaceValue={search.replaceValue}
            onReplaceChange={search.setReplaceValue}
            showReplace={search.showReplace}
            onToggleReplace={() => search.setShowReplace((value) => !value)}
            options={search.searchOptions}
            onToggleOption={search.toggleSearchOption}
            current={search.matchInfo.current}
            total={search.matchInfo.total}
            regexError={search.regexError}
            onNext={search.handleNextMatch}
            onPrevious={search.handlePreviousMatch}
            onClose={search.closeSearch}
            onReplaceCurrent={search.handleReplaceCurrent}
            onReplaceAll={search.handleReplaceAll}
          />
        </div>
      )}
      <div ref={beforeSpacerRef} className="bounded-editor-spacer" aria-hidden="true" />
      <div
        ref={hostRef}
        className="prosemirror-host"
        data-editor-font={editorSettings.editorFont}
        data-editor-line-height={editorSettings.editorLineHeight}
        style={
          {
            "--editor-placeholder": cssStringLiteral(editorSettings.editorPlaceholder),
          } as CSSProperties
        }
      />
      <div ref={afterSpacerRef} className="bounded-editor-spacer" aria-hidden="true" />
      <textarea
        ref={accessibleDocumentRef}
        id="bounded-editor-full-document"
        className="bounded-editor-accessible-document"
        aria-label="Full note text"
        readOnly
        onFocus={() => {
          const entry = activeEntry();
          const document = entry?.bounded?.fullDocument();
          if (document && accessibleDocumentRef.current) {
            accessibleDocumentRef.current.value = fullDocumentText(document);
          }
        }}
        onBlur={() => {
          if (accessibleDocumentRef.current) accessibleDocumentRef.current.value = "";
        }}
      />
      {activeNoteId === null && <div className="editor-empty">Select a note</div>}
      {slashMenu.open && slashItems.length > 0 && (
        <div className="slash-menu" role="listbox" style={{ left: slashMenu.x, top: slashMenu.y }}>
          {slashItems.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === slashMenu.index % slashItems.length}
              className={index === slashMenu.index % slashItems.length ? "is-selected" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                const view = viewRef.current;
                if (view) applySlashCommand(view, command);
                setSlashMenu(closedSlashMenu);
              }}
            >
              {command.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
