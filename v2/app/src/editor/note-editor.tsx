import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  AllSelection,
  EditorState,
  NodeSelection,
  TextSelection,
  type Plugin,
  type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createCodeBlockNodeView } from "./code-block-nodeview";
import { createImageNodeViews } from "./image-nodeview";
import { collectImageFiles, insertImages, pickImageFiles } from "./image-input";
import { readImageAlt, renameImageNode } from "./image-actions";
import { registerPendingWork } from "../lifecycle/pending-work";
import { openExternalUrl } from "../bridge/external-links";
import { ImageInfoDialog, ImageLightbox, ImageRenameDialog } from "./image-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../shared/ui/context-menu";
import { InfoIcon, PencilIcon, ZoomInIcon } from "../shared/icons";
import { createMentionPlugin, type MentionContext } from "../references/mention-plugin";
import { createReferenceNodeViews } from "../references/reference-nodeview";
import { activateReference } from "../references/reference-navigation";
import { resolveReference } from "../references/reference-resolver";
import type { ReferenceKind } from "../references/types";
import {
  commitOperations,
  commitReferenceOperations,
  createLinkedNote,
} from "../actions/workspace";
import { cssStringLiteral } from "../settings/apply-settings";
import { projectSettings } from "../settings/settings-model";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "../store/types";
import type { WorkspaceImage, WorkspaceOperation } from "../contracts/workspace";
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
  linkPastedText,
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
import { applySlashCommand, filterSlashCommands, type SlashAction } from "./slash-commands";
import { BubbleMenu, closedBubbleMenu, computeBubbleMenu } from "./bubble-menu";
import {
  clampLinkMenuX,
  closedLinkMenu,
  LinkMenu,
  linkAtCursor,
  linkInRange,
} from "./link-menu";
import { SearchWidget } from "./search-widget";
import { useEditorSearch } from "./use-editor-search";

const SAVE_DEBOUNCE_MS = 500;
const VIRTUAL_BLOCK_HEIGHT = 32;
const WINDOW_SHIFT = Math.floor(BOUNDED_BLOCK_LIMIT / 2);

type Props = {
  store: RendererStore;
  /**
   * Binds this editor instance to a pane-specific note. Defaults to the
   * store's active note, which is the primary pane's active tab (ADR-0021).
   */
  selectNoteId?: (state: RendererState) => string | null;
};

type CachedNote = {
  state: EditorState;
  revision: number;
  bounded: BoundedDocument | null;
  searchState: EditorState | null;
  scrollTop: number;
  wholeSelected: boolean;
  derivedTitle: string;
};

type SlashMenu = {
  open: boolean;
  query: string;
  index: number;
  x: number;
  y: number;
  openUp: boolean;
};

const closedSlashMenu: SlashMenu = {
  open: false,
  query: "",
  index: 0,
  x: 0,
  y: 0,
  openUp: false,
};

const SLASH_MENU_WIDTH = 264;
const SLASH_MENU_MAX_HEIGHT = 324;

type ImageDialogState =
  | { kind: "rename"; imageId: string; alt: string }
  | { kind: "bigger"; image: WorkspaceImage; alt: string }
  | { kind: "info"; image: WorkspaceImage; alt: string }
  | null;

function emptyDocument(): ProseMirrorNode {
  return productSchema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph" }] });
}

function selectedReference(view: EditorView): { kind: ReferenceKind; targetId: string } | null {
  const { selection } = view.state;
  if (!(selection instanceof NodeSelection)) {
    return null;
  }
  const { node } = selection;
  const id = typeof node.attrs.id === "string" ? node.attrs.id : null;
  if (!id) {
    return null;
  }
  if (node.type.name === "tag_ref") {
    return { kind: "tag", targetId: id };
  }
  if (node.type.name === "mention_ref") {
    return { kind: node.attrs.kind === "note" ? "note" : "person", targetId: id };
  }
  return null;
}

function createEditorState(
  document: ProseMirrorNode,
  extraPlugins: readonly Plugin[] = [],
): EditorState {
  return EditorState.create({
    doc: document,
    plugins: [...extraPlugins, ...createProductPlugins()],
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

const TITLE_MAX_LENGTH = 120;
const STARTER_TITLE = "Untitled";

function deriveTitle(document: ProseMirrorNode): string {
  const text = document.firstChild?.textContent.trim() ?? "";
  return text.length > 0 ? text.slice(0, TITLE_MAX_LENGTH) : STARTER_TITLE;
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
    derivedTitle: deriveTitle(document),
  };
}

function isStarterDocument(document: ProseMirrorNode): boolean {
  const first = document.firstChild;
  return (
    first !== null &&
    first.type.name === "heading" &&
    document.childCount <= 2 &&
    document.textContent === STARTER_TITLE
  );
}

/**
 * A freshly created note opens with its "Untitled" heading selected so typing
 * immediately replaces the placeholder title. Applied outside
 * dispatchTransaction on purpose: the programmatic selection must not open the
 * bubble menu.
 */
function selectStarterTitle(view: EditorView, entry: CachedNote): void {
  const document = view.state.doc;
  const first = document.firstChild;
  if (!first || !isStarterDocument(document)) return;
  const next = view.state.apply(
    view.state.tr.setSelection(TextSelection.create(document, 1, 1 + first.content.size)),
  );
  view.updateState(next);
  entry.state = next;
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

function selectStoreActiveNote(state: RendererState): string | null {
  return state.activeNoteId;
}

function fullDocumentText(document: ProseMirrorNode): string {
  return document.textBetween(0, document.content.size, "\n\n");
}

function fullDocumentHtml(document: ProseMirrorNode): string {
  const container = window.document.createElement("div");
  container.append(DOMSerializer.fromSchema(productSchema).serializeFragment(document.content));
  return container.innerHTML;
}

export function NoteEditor({ store, selectNoteId = selectStoreActiveNote }: Props) {
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
  const slashDismissedRef = useRef(false);
  const [bubbleMenu, setBubbleMenu] = useState(closedBubbleMenu);
  const bubbleMenuRef = useRef(bubbleMenu);
  bubbleMenuRef.current = bubbleMenu;
  const bubbleMenuHostRef = useRef<HTMLDivElement>(null);
  const [linkMenu, setLinkMenu] = useState(closedLinkMenu);
  const linkMenuRef = useRef(linkMenu);
  linkMenuRef.current = linkMenu;
  const imageMenuTriggerRef = useRef<HTMLSpanElement>(null);
  const [imageMenuImageId, setImageMenuImageId] = useState<string | null>(null);
  const [imageDialog, setImageDialog] = useState<ImageDialogState>(null);
  const activeNoteId = useRendererSelector(store, selectNoteId);
  const settingsDocument = useRendererSelector(store, (state) => state.settings);
  const editorSettings = projectSettings(settingsDocument);
  const mentionPluginsRef = useRef<Plugin[] | null>(null);
  if (mentionPluginsRef.current === null) {
    const mentionContext: MentionContext = {
      getState: () => store.getState(),
      applyReferenceOperations: (operations) => {
        commitReferenceOperations(store, operations);
      },
      createNote: (id, title) => {
        createLinkedNote(store, id, title);
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

  function saveNow(noteId: string): Promise<void> {
    const cached = cacheRef.current.get(noteId);
    const record = store.getState().documents.get(noteId);
    if (!cached || !record) return Promise.resolve();
    const document = cached.bounded?.fullDocument() ?? cached.state.doc;
    const at = Date.now();
    const operations: WorkspaceOperation[] = [
      {
        type: "save_document",
        noteId,
        documentJson: document.toJSON(),
        markdown: serializeProductMarkdown(document),
        wordCount: countWords(document),
        expectedRevision: record.revision,
        at,
      },
    ];
    const title = deriveTitle(document);
    if (title !== cached.derivedTitle) {
      cached.derivedTitle = title;
      operations.push({ type: "rename_node", id: noteId, title, at });
    }
    return commitOperations(store, operations)
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

  function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current === null) return Promise.resolve();
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    return activeIdRef.current ? saveNow(activeIdRef.current) : Promise.resolve();
  }

  function schedulePendingSave(): void {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      if (activeIdRef.current) void saveNow(activeIdRef.current);
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
    setBubbleMenu(computeBubbleMenu(view));
    if (!linkMenuRef.current.editing) {
      const cursorLink = linkAtCursor(next);
      if (cursorLink) {
        const linkCoords = view.coordsAtPos(cursorLink.from);
        setLinkMenu({
          open: true,
          editing: false,
          href: cursorLink.href,
          from: cursorLink.from,
          to: cursorLink.to,
          x: clampLinkMenuX(linkCoords.left),
          y: linkCoords.bottom + 6,
        });
      } else if (linkMenuRef.current.open) {
        setLinkMenu(closedLinkMenu);
      }
    }
    const menu = slashMenuState(next);
    if (!menu.open) {
      slashDismissedRef.current = false;
      if (slashMenuRef.current.open) setSlashMenu(closedSlashMenu);
      return;
    }
    if (slashDismissedRef.current) return;
    const coords = view.coordsAtPos(next.selection.from);
    const openUp = coords.bottom + 4 + SLASH_MENU_MAX_HEIGHT > window.innerHeight;
    setSlashMenu((previous) => ({
      open: true,
      query: menu.query,
      index: previous.query === menu.query ? previous.index : 0,
      x: Math.max(12, Math.min(coords.left, window.innerWidth - SLASH_MENU_WIDTH - 12)),
      y: openUp ? coords.top - 4 : coords.bottom + 4,
      openUp,
    }));
  }

  function runSlashAction(view: EditorView, action: SlashAction | null): void {
    if (action === "insert-image") {
      pickImageFiles((files) => {
        const noteId = activeIdRef.current;
        if (!noteId || files.length === 0) return;
        insertImages(store, view, noteId, files, null);
        view.focus();
      });
    }
  }

  function openLinkEditor(): void {
    const view = viewRef.current;
    if (!view) return;
    const { selection } = view.state;
    const cursorLink = selection.empty ? linkAtCursor(view.state) : null;
    const from = cursorLink ? cursorLink.from : selection.from;
    const to = cursorLink ? cursorLink.to : selection.to;
    if (from === to) return;
    const coords = view.coordsAtPos(from);
    setBubbleMenu(closedBubbleMenu);
    setLinkMenu({
      open: true,
      editing: true,
      href: cursorLink ? cursorLink.href : linkInRange(view.state, from, to),
      from,
      to,
      x: clampLinkMenuX(coords.left),
      y: coords.bottom + 6,
    });
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
    const imageViews = createImageNodeViews(store, (imageId, clientX, clientY) => {
      setImageMenuImageId(imageId);
      imageMenuTriggerRef.current?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX, clientY }),
      );
    });
    const view = new EditorView(host, {
      state: createEditorState(emptyDocument(), mentionPlugins),
      editable: () => activeIdRef.current !== null,
      nodeViews: {
        ...referenceViews.nodeViews,
        ...imageViews.nodeViews,
        code_block: createCodeBlockNodeView,
      },
      dispatchTransaction,
      handleClick(currentView, pos, event) {
        if (!event.metaKey && !event.ctrlKey) return false;
        const href = linkInRange(currentView.state, pos, pos + 1);
        if (!href) return false;
        event.preventDefault();
        openExternalUrl(href).catch((error) => {
          console.error("open external url rejected", error);
        });
        return true;
      },
      handlePaste(currentView, event) {
        const noteId = activeIdRef.current;
        const files = collectImageFiles(event.clipboardData);
        if (noteId && files.length > 0) {
          event.preventDefault();
          return insertImages(store, currentView, noteId, files, null);
        }
        if (linkPastedText(currentView, event.clipboardData?.getData("text/plain") ?? "")) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDrop(currentView, event, _slice, moved) {
        if (moved) return false;
        const noteId = activeIdRef.current;
        const files = collectImageFiles(event.dataTransfer);
        if (!noteId || files.length === 0) return false;
        event.preventDefault();
        const drop = currentView.posAtCoords({ left: event.clientX, top: event.clientY });
        return insertImages(store, currentView, noteId, files, drop?.pos ?? null);
      },
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
        if (mod && event.shiftKey && event.key.toLowerCase() === "k") {
          openLinkEditor();
          return true;
        }
        if (
          !mod &&
          !event.shiftKey &&
          event.key === "Tab" &&
          bubbleMenuRef.current.open &&
          !slashMenuRef.current.open
        ) {
          const first = bubbleMenuHostRef.current?.querySelector("button");
          if (first instanceof HTMLButtonElement) {
            event.preventDefault();
            first.focus();
            return true;
          }
        }
        if (!mod && event.key === "Enter") {
          const reference = selectedReference(currentView);
          if (reference) {
            const resolved = resolveReference(
              store.getState(),
              reference.kind,
              reference.targetId,
              "",
            );
            if (resolved.availability === "resolved") {
              activateReference(store, reference.kind, reference.targetId);
              return true;
            }
          }
        }
        const menu = slashMenuRef.current;
        if (!menu.open) return false;
        if (event.key === "Escape") {
          slashDismissedRef.current = true;
          setSlashMenu(closedSlashMenu);
          return true;
        }
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
        if (event.key === "Enter" || event.key === "Tab") {
          const command = commands[menu.index % commands.length];
          if (command) runSlashAction(currentView, applySlashCommand(currentView, command));
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
      setBubbleMenu((previous) => (previous.open ? closedBubbleMenu : previous));
      setLinkMenu((previous) =>
        previous.open && !previous.editing ? closedLinkMenu : previous,
      );
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
    const handleBlur = (event: FocusEvent) => {
      const focused = event.relatedTarget;
      const intoBubbleMenu =
        focused instanceof HTMLElement && focused.closest(".bubble-menu") !== null;
      if (!intoBubbleMenu) {
        setBubbleMenu((previous) => (previous.open ? closedBubbleMenu : previous));
      }
      const next = event.relatedTarget;
      if (!(next instanceof HTMLElement) || !next.closest(".link-menu")) {
        setLinkMenu((previous) => (previous.open ? closedLinkMenu : previous));
      }
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
    view.dom.addEventListener("blur", handleBlur);
    view.dom.addEventListener("copy", handleCopy);
    const unregisterPendingSave = registerPendingWork(() => flushPendingSave());
    return () => {
      unregisterPendingSave();
      void flushPendingSave();
      scrollHost?.removeEventListener("scroll", handleScroll);
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("blur", handleBlur);
      view.dom.removeEventListener("copy", handleCopy);
      viewRef.current = null;
      view.destroy();
      referenceViews.destroy();
      imageViews.destroy();
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
    setBubbleMenu(closedBubbleMenu);
    setLinkMenu(closedLinkMenu);
    if (activeNoteId === null) {
      view.updateState(createEditorState(emptyDocument(), mentionPlugins));
      syncBoundedSurface({
        state: view.state,
        revision: 0,
        bounded: null,
        searchState: null,
        scrollTop: 0,
        wholeSelected: false,
        derivedTitle: STARTER_TITLE,
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
      selectStarterTitle(view, entry);
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

  function openImageRename(imageId: string): void {
    const view = viewRef.current;
    if (!view) return;
    setImageDialog({ kind: "rename", imageId, alt: readImageAlt(view.state.doc, imageId) });
  }

  function openImageBigger(imageId: string): void {
    const view = viewRef.current;
    const image = store.getState().images.get(imageId);
    if (!view || !image) return;
    setImageDialog({ kind: "bigger", image, alt: readImageAlt(view.state.doc, imageId) });
  }

  function openImageInfo(imageId: string): void {
    const view = viewRef.current;
    const image = store.getState().images.get(imageId);
    if (!view || !image) return;
    setImageDialog({ kind: "info", image, alt: readImageAlt(view.state.doc, imageId) });
  }

  return (
    <div className="editor-host">
      {search.searchOpen && (
        <div className="@container/editor-search sticky top-3 z-40 -mx-9 flex h-0 items-start justify-end">
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
      <BubbleMenu
        state={bubbleMenu}
        getView={() => viewRef.current}
        onLink={openLinkEditor}
        onDismiss={() => setBubbleMenu(closedBubbleMenu)}
        containerRef={bubbleMenuHostRef}
      />
      <LinkMenu
        state={linkMenu}
        getView={() => viewRef.current}
        onClose={() => setLinkMenu(closedLinkMenu)}
        onEdit={() => setLinkMenu((previous) => ({ ...previous, editing: true }))}
      />
      {slashMenu.open && slashItems.length > 0 && (
        <div
          className={slashMenu.openUp ? "slash-menu is-above" : "slash-menu"}
          role="listbox"
          aria-label="Insert block"
          style={{ left: slashMenu.x, top: slashMenu.y }}
        >
          {slashItems.map((command, index) => {
            const selected = index === slashMenu.index % slashItems.length;
            const groupStart = index === 0 || slashItems[index - 1]?.group !== command.group;
            return (
              <div key={command.id}>
                {groupStart && <div className="slash-menu-group">{command.group}</div>}
                <button
                  ref={selected ? (node) => node?.scrollIntoView({ block: "nearest" }) : undefined}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? "is-selected" : ""}
                  onMouseMove={() => {
                    if (!selected) setSlashMenu((previous) => ({ ...previous, index }));
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const view = viewRef.current;
                    if (view) runSlashAction(view, applySlashCommand(view, command));
                    setSlashMenu(closedSlashMenu);
                  }}
                >
                  <span className="slash-menu-icon" aria-hidden="true">
                    {command.icon}
                  </span>
                  <span className="slash-menu-text">
                    <span className="slash-menu-label">{command.label}</span>
                    <span className="slash-menu-subtext">{command.subtext}</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <span ref={imageMenuTriggerRef} aria-hidden="true" className="fixed left-0 top-0 h-0 w-0" />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem
            className="gap-2"
            onSelect={() => imageMenuImageId && openImageRename(imageMenuImageId)}
          >
            <PencilIcon size={14} />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => imageMenuImageId && openImageBigger(imageMenuImageId)}
          >
            <ZoomInIcon size={14} />
            View bigger
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => imageMenuImageId && openImageInfo(imageMenuImageId)}
          >
            <InfoIcon size={14} />
            View info
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {imageDialog?.kind === "rename" && (
        <ImageRenameDialog
          initialAlt={imageDialog.alt}
          onSubmit={(alt) => {
            const view = viewRef.current;
            if (view) renameImageNode(view, imageDialog.imageId, alt);
          }}
          onClose={() => setImageDialog(null)}
        />
      )}
      {imageDialog?.kind === "bigger" && (
        <ImageLightbox
          image={imageDialog.image}
          alt={imageDialog.alt}
          onClose={() => setImageDialog(null)}
        />
      )}
      {imageDialog?.kind === "info" && (
        <ImageInfoDialog
          image={imageDialog.image}
          alt={imageDialog.alt}
          onClose={() => setImageDialog(null)}
        />
      )}
    </div>
  );
}
