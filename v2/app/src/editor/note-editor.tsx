import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { commitOperations } from "../actions/workspace";
import { cssStringLiteral } from "../settings/apply-settings";
import { projectSettings } from "../settings/settings-model";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import {
  countWords,
  createProductPlugins,
  productSchema,
  serializeProductMarkdown,
  slashMenuState,
} from "./schema";
import { applySlashCommand, filterSlashCommands } from "./slash-commands";
import { SearchWidget } from "./search-widget";
import { useEditorSearch } from "./use-editor-search";

const SAVE_DEBOUNCE_MS = 500;

type Props = {
  store: RendererStore;
};

type CachedNote = {
  state: EditorState;
  revision: number;
};

type SlashMenu = {
  open: boolean;
  query: string;
  index: number;
  x: number;
  y: number;
};

const closedSlashMenu: SlashMenu = { open: false, query: "", index: 0, x: 0, y: 0 };

function emptyEditorState(): EditorState {
  return EditorState.create({
    doc: productSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] }),
    plugins: createProductPlugins(),
  });
}

function documentFromJson(json: unknown): ProseMirrorNode {
  try {
    return productSchema.nodeFromJSON(json);
  } catch {
    return productSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] });
  }
}

export function NoteEditor({ store }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cacheRef = useRef(new Map<string, CachedNote>());
  const activeIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(closedSlashMenu);
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const activeNoteId = useRendererSelector(store, (state) => state.activeNoteId);
  const settingsDocument = useRendererSelector(store, (state) => state.settings);
  const editorSettings = projectSettings(settingsDocument);
  const getEditorView = useCallback(() => viewRef.current, []);
  const search = useEditorSearch(store, getEditorView);
  const searchRef = useRef(search);
  searchRef.current = search;

  function saveNow(noteId: string): void {
    const cached = cacheRef.current.get(noteId);
    const record = store.getState().documents.get(noteId);
    if (!cached || !record) {
      return;
    }
    const doc = cached.state.doc;
    void commitOperations(store, [
      {
        type: "save_document",
        noteId,
        documentJson: doc.toJSON(),
        markdown: serializeProductMarkdown(doc),
        wordCount: countWords(doc),
        expectedRevision: record.revision,
        at: Date.now(),
      },
    ])
      .then(() => {
        const entry = cacheRef.current.get(noteId);
        const saved = store.getState().documents.get(noteId);
        if (entry && saved) {
          cacheRef.current.set(noteId, { ...entry, revision: saved.revision });
        }
      })
      .catch((error) => {
        console.error("save rejected", error);
        cacheRef.current.delete(noteId);
      });
  }

  function flushPendingSave(): void {
    if (saveTimerRef.current === null) {
      return;
    }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (activeIdRef.current) {
      saveNow(activeIdRef.current);
    }
  }

  function schedulePendingSave(): void {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      if (activeIdRef.current) {
        saveNow(activeIdRef.current);
      }
    }, SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const view = new EditorView(host, {
      state: emptyEditorState(),
      editable: () => activeIdRef.current !== null,
      dispatchTransaction: (transaction) => {
        const current = viewRef.current;
        if (!current) {
          return;
        }
        const next = current.state.apply(transaction);
        current.updateState(next);
        const noteId = activeIdRef.current;
        if (noteId) {
          const cached = cacheRef.current.get(noteId);
          cacheRef.current.set(noteId, {
            state: next,
            revision: cached?.revision ?? 0,
          });
          if (transaction.docChanged) {
            schedulePendingSave();
          }
        }
        if (transaction.docChanged && searchRef.current.searchOpen) {
          searchRef.current.syncMatchInfo();
        }
        const menu = slashMenuState(next);
        if (!menu.open) {
          if (slashMenuRef.current.open) {
            setSlashMenu(closedSlashMenu);
          }
          return;
        }
        const coords = current.coordsAtPos(next.selection.from);
        setSlashMenu((previous) => ({
          open: true,
          query: menu.query,
          index: previous.query === menu.query ? previous.index : 0,
          x: coords.left,
          y: coords.bottom + 4,
        }));
      },
      handleKeyDown: (currentView, event) => {
        const menu = slashMenuRef.current;
        if (!menu.open) {
          return false;
        }
        const commands = filterSlashCommands(menu.query);
        if (commands.length === 0) {
          return false;
        }
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
          if (command) {
            applySlashCommand(currentView, command);
          }
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
    return () => {
      flushPendingSave();
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    searchRef.current.resetSearch();
    flushPendingSave();
    activeIdRef.current = activeNoteId;
    setSlashMenu(closedSlashMenu);
    if (activeNoteId === null) {
      view.updateState(emptyEditorState());
      return;
    }
    const record = store.getState().documents.get(activeNoteId);
    if (!record) {
      view.updateState(emptyEditorState());
      return;
    }
    const cached = cacheRef.current.get(activeNoteId);
    if (cached && cached.revision === record.revision) {
      view.updateState(cached.state);
    } else {
      const state = EditorState.create({
        doc: documentFromJson(record.documentJson),
        plugins: createProductPlugins(),
      });
      cacheRef.current.set(activeNoteId, { state, revision: record.revision });
      view.updateState(state);
    }
    view.focus();
  }, [activeNoteId, store]);

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
                if (view) {
                  applySlashCommand(view, command);
                }
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
