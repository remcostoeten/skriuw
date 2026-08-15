import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  AllSelection,
  EditorState,
  NodeSelection,
  TextSelection,
  type Command,
  type Plugin,
  type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createCodeBlockNodeView } from "./code-block-nodeview";
import { createDiagramNodeView } from "./diagram-nodeview";
import { createImageNodeViews } from "./image-nodeview";
import {
  collectImageFiles,
  collectVideoFiles,
  insertImages,
  insertLibraryMedia,
  insertVideos,
  persistMediaFile,
  pickImageFiles,
  pickVideoFiles,
} from "./image-input";
import { noteImageIds, readImageAlt, renameImageNode } from "./image-actions";
import { pasteMarkdown } from "./markdown-paste";
import { deriveTitle, STARTER_TITLE } from "./note-title";
import { registerPendingWork } from "@/shell/pending-work";
import { openExternalUrl } from "@/bridge/external-links";
import type { MediaBlobPayload } from "@/bridge/commands";
import { ImageInfoDialog, ImageLightbox, ImageRenameDialog } from "./image-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  InfoIcon,
  PencilIcon,
  Trash2Icon,
  ZoomInIcon,
} from "@/shared/icons/static";
import { createMentionPlugin, type MentionContext } from "@/features/references/mention-plugin";
import { createReferenceNodeViews } from "@/features/references/reference-nodeview";
import { activateReference } from "@/features/references/reference-navigation";
import { resolveReference } from "@/features/references/reference-resolver";
import type { ReferenceKind } from "@/features/references/types";
import {
  commitOperations,
  commitReferenceOperations,
  createLinkedNote,
} from "@/store/actions/workspace";
import { cssStringLiteral } from "@/features/settings/apply-settings";
import { projectSettings } from "@/features/settings/settings-model";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { DocumentRecord, RendererState, RendererStore } from "@/store/types";
import type { WorkspaceImage, WorkspaceOperation } from "@/contracts/workspace";
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
  toggleCheckItemAtSelection,
  type SlashTrigger,
} from "./schema";
import {
  createSearchPlugin,
  getSearchState,
  searchPluginKey,
  setSearch,
  type EditorSearchTarget,
} from "./search-plugin";
import {
  applySlashCommand,
  filterSlashItems,
  insertMedia,
  type SlashAction,
  type SlashCommand,
} from "./slash-commands";
import { MediaLibraryPicker } from "./media-library-picker";
import type { LibraryMediaKind } from "./media-library-picker";
import { createMediaNodeView } from "./media-nodeview";
import {
  deleteBlock,
  duplicateBlock,
  insertBlockAfter,
  moveBlock,
  topLevelBlockAt,
} from "./block-commands";
import {
  firstTableCellTextPosition,
  isTableCommandAvailable,
  tableCommands,
  type TableCommand,
} from "./table-commands";
import {
  createDragHandle,
  type BlockMenuTarget,
  type DragHandleController,
} from "./drag-handle";
import {
  BubbleMenu,
  bubbleMenuStateEqual,
  closedBubbleMenu,
  computeBubbleMenu,
} from "./bubble-menu";
import {
  closedLinkMenu,
  LinkMenu,
  linkAtCursor,
  linkInRange,
  linkMenuAnchor,
} from "./link-menu";
import {
  documentEdgeSelection,
  documentEdgeWindowStart,
  type DocumentEdge,
} from "./document-edges";
import { SearchWidget } from "./search-widget";
import { JumpToLinePanel } from "./jump-to-line-panel";
import {
  buildDocumentLineIndex,
  documentLineTarget,
  type DocumentLineIndex,
} from "./document-lines";
import { parseJumpToLineInput } from "./raw-markdown-editor-model";
import { useEditorBoundShortcuts } from "./use-editor-bound-shortcuts";
import type { EditorBoundHandlersFor } from "./use-editor-bound-shortcuts";
import type { NoteEditorShortcutId } from "./editor-bound-shortcut-ids";
import { useEditorSearch } from "./use-editor-search";
import { taskPromotionOperations } from "./task-linking";
import { SaveSequencer } from "./save-sequencer";
import { EDITOR_WORKING_SET_LIMIT, EditorWorkingSet } from "./editor-working-set";
import { preparedEditorDocuments } from "./prepared-documents";

const SAVE_DEBOUNCE_MS = 500;
const VIRTUAL_BLOCK_HEIGHT = 32;
const WINDOW_SHIFT = Math.floor(BOUNDED_BLOCK_LIMIT / 2);
const UTILITY_LAYOUT_TRANSITION = {
  layout: {
    duration: 0.14,
    ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
  },
};
const REDUCED_UTILITY_LAYOUT_TRANSITION = { layout: { duration: 0 } };

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
  trigger: SlashTrigger;
  query: string;
  index: number;
  x: number;
  y: number;
  openUp: boolean;
};

const closedSlashMenu: SlashMenu = {
  open: false,
  trigger: "/",
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
  plugins: readonly Plugin[],
): EditorState {
  return EditorState.create({
    doc: document,
    plugins,
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
  document: ProseMirrorNode,
  extraPlugins: readonly Plugin[],
): CachedNote {
  const bounded = shouldUseBoundedEditor(document) ? createBoundedDocument(document) : null;
  return {
    state: createEditorState(bounded?.windowDocument() ?? document, extraPlugins),
    revision: record.revision,
    bounded,
    searchState: null,
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
  const [shortcutHost, setShortcutHost] = useState<HTMLDivElement | null>(null);
  const [utilityOverlayHost, setUtilityOverlayHost] = useState<HTMLDivElement | null>(null);
  // An inline ref callback gets a fresh identity every render, so React 19
  // detaches (null) and reattaches it on each commit; the setState inside
  // then alternates null/node and loops the commit phase forever. The ref
  // must stay identity-stable.
  const attachShortcutHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    setShortcutHost(node);
  }, []);
  const beforeSpacerRef = useRef<HTMLDivElement>(null);
  const afterSpacerRef = useRef<HTMLDivElement>(null);
  const accessibleDocumentRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const cacheRef = useRef(new EditorWorkingSet<CachedNote>(EDITOR_WORKING_SET_LIMIT));
  const dirtyNoteIdsRef = useRef(new Set<string>());
  const activeIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [failedSaveNoteIds, setFailedSaveNoteIds] = useState<ReadonlySet<string>>(new Set());
  const saveSequencerRef = useRef<SaveSequencer | null>(null);
  if (saveSequencerRef.current === null) {
    saveSequencerRef.current = new SaveSequencer((failures) => {
      setFailedSaveNoteIds(new Set(failures.map(({ noteId }) => noteId)));
    });
  }
  const jumpInputRef = useRef<HTMLInputElement>(null);
  const jumpTargetRef = useRef<{ document: ProseMirrorNode; index: DocumentLineIndex } | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpLineCount, setJumpLineCount] = useState(1);
  const [jumpCaretLine, setJumpCaretLine] = useState(1);
  const jumpOpenRef = useRef(jumpOpen);
  jumpOpenRef.current = jumpOpen;
  const jumpFieldId = useId();
  const composingRef = useRef(false);
  const pendingWindowRef = useRef<number | null>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const boundedSurfaceKeyRef = useRef("");
  const [slashMenu, setSlashMenu] = useState<SlashMenu>(closedSlashMenu);
  const [mediaLibraryKind, setMediaLibraryKind] = useState<LibraryMediaKind | null>(null);
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const slashDismissedRef = useRef(false);
  const [bubbleMenu, setBubbleMenu] = useState(closedBubbleMenu);
  const bubbleMenuRef = useRef(bubbleMenu);
  bubbleMenuRef.current = bubbleMenu;
  const bubbleMenuHostRef = useRef<HTMLDivElement>(null);
  const bubbleDismissedRef = useRef<{ from: number; to: number } | null>(null);
  const [linkMenu, setLinkMenu] = useState(closedLinkMenu);
  const linkMenuRef = useRef(linkMenu);
  linkMenuRef.current = linkMenu;
  const imageMenuTriggerRef = useRef<HTMLSpanElement>(null);
  const [imageMenuImageId, setImageMenuImageId] = useState<string | null>(null);
  const [imageDialog, setImageDialog] = useState<ImageDialogState>(null);
  const dragHandleRef = useRef<DragHandleController | null>(null);
  const blockMenuTriggerRef = useRef<HTMLSpanElement>(null);
  const [blockMenuPos, setBlockMenuPos] = useState<number | null>(null);
  const activeNoteId = useRendererSelector(store, selectNoteId);
  const settingsDocument = useRendererSelector(store, (state) => state.settings);
  const editorSettings = projectSettings(settingsDocument);
  const prefersReducedMotion = useReducedMotion();
  const reduceUtilityMotion = editorSettings.reduceMotion || prefersReducedMotion === true;
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
  const editorPluginsRef = useRef<Plugin[] | null>(null);
  if (editorPluginsRef.current === null) {
    editorPluginsRef.current = [...mentionPlugins, ...createProductPlugins()];
  }
  const editorPlugins = editorPluginsRef.current;
  const preparedDocumentsRef = useRef<ReturnType<typeof preparedEditorDocuments> | null>(null);
  if (preparedDocumentsRef.current === null) {
    preparedDocumentsRef.current = preparedEditorDocuments(store);
  }
  const preparedDocuments = preparedDocumentsRef.current;

  function activeEntry(): CachedNote | null {
    const noteId = activeIdRef.current;
    return noteId ? (cacheRef.current.get(noteId) ?? null) : null;
  }

  function pruneEditorWorkingSet(): void {
    const protectedIds = new Set(dirtyNoteIdsRef.current);
    if (activeIdRef.current) protectedIds.add(activeIdRef.current);
    cacheRef.current.prune(protectedIds);
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
      entry.state = createEditorState(bounded.windowDocument(), editorPlugins);
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

  function persistCurrentDocument(noteId: string): Promise<void> {
    const cached = cacheRef.current.get(noteId);
    const record = store.getState().documents.get(noteId);
    if (!cached || !record) return Promise.resolve();
    const document = cached.bounded?.fullDocument() ?? cached.state.doc;
    const at = Date.now();
    const documentJson = document.toJSON();
    preparedDocuments.stage(noteId, documentJson, document);
    const operations: WorkspaceOperation[] = [
      {
        type: "save_document",
        noteId,
        documentJson,
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
    return commitOperations(store, operations).then(async () => {
        const entry = cacheRef.current.get(noteId);
        const saved = store.getState().documents.get(noteId);
        if (entry && saved) {
          entry.revision = saved.revision;
          const current = entry.bounded?.fullDocument() ?? entry.state.doc;
          if (current.eq(document)) {
            dirtyNoteIdsRef.current.delete(noteId);
          }
        }
        pruneEditorWorkingSet();

        const promotionSource = store.getState().documents.get(noteId);
        if (promotionSource) {
          const promotionOperations = taskPromotionOperations(
            document,
            noteId,
            {
              documentJson,
              markdown: serializeProductMarkdown(document),
              wordCount: countWords(document),
              expectedRevision: promotionSource.revision,
            },
            store.getState().tasks,
            at,
          );
          if (promotionOperations.length > 0) await commitOperations(store, promotionOperations);
        }
      });
  }

  function saveNow(noteId: string): Promise<void> {
    return saveSequencerRef.current!.enqueue(noteId, () => persistCurrentDocument(noteId));
  }

  function reportBackgroundSaveFailure(error: unknown): void {
    console.error("save rejected", error);
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      if (activeIdRef.current) {
        await saveNow(activeIdRef.current).catch(() => undefined);
      }
    }
    await saveSequencerRef.current!.flush();
  }

  function schedulePendingSave(): void {
    if (activeIdRef.current) dirtyNoteIdsRef.current.add(activeIdRef.current);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      if (activeIdRef.current) {
        void saveNow(activeIdRef.current).catch(reportBackgroundSaveFailure);
      }
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
    if (transaction.docChanged) dragHandleRef.current?.hide();
    const dismissed = bubbleDismissedRef.current;
    if (
      dismissed &&
      (dismissed.from !== next.selection.from || dismissed.to !== next.selection.to)
    ) {
      bubbleDismissedRef.current = null;
    }
    const nextBubbleMenu =
      linkMenuRef.current.editing || bubbleDismissedRef.current !== null
        ? closedBubbleMenu
        : computeBubbleMenu(view);
    if (!bubbleMenuStateEqual(bubbleMenuRef.current, nextBubbleMenu)) {
      setBubbleMenu(nextBubbleMenu);
    }
    if (!linkMenuRef.current.editing) {
      const cursorLink = linkAtCursor(next);
      if (cursorLink) {
        setLinkMenu({
          open: true,
          editing: false,
          href: cursorLink.href,
          from: cursorLink.from,
          to: cursorLink.to,
          ...linkMenuAnchor(view, cursorLink.from, cursorLink.to),
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
      trigger: menu.trigger,
      query: menu.query,
      index:
        previous.query === menu.query && previous.trigger === menu.trigger ? previous.index : 0,
      x: Math.max(12, Math.min(coords.left, window.innerWidth - SLASH_MENU_WIDTH - 12)),
      y: openUp ? coords.top - 4 : coords.bottom + 4,
      openUp,
    }));
  }

  function runSlashAction(view: EditorView, action: SlashAction | null): void {
    if (action === "pick-image") {
      setMediaLibraryKind("image");
      return;
    }
    if (action === "pick-video") {
      setMediaLibraryKind("video");
      return;
    }
    if (action === "open-emoji") {
      view.dispatch(view.state.tr.insertText(":"));
      view.focus();
    }
  }

  function selectLibraryMedia(blob: MediaBlobPayload): void {
    const view = viewRef.current;
    const noteId = activeIdRef.current;
    const kind = mediaLibraryKind;
    setMediaLibraryKind(null);
    if (!view || !noteId || !kind) return;
    insertLibraryMedia(store, view, noteId, kind, blob);
    view.focus();
  }

  function uploadLibraryMedia(): void {
    const view = viewRef.current;
    const noteId = activeIdRef.current;
    const kind = mediaLibraryKind;
    setMediaLibraryKind(null);
    if (!view || !noteId || !kind) return;
    const pickFiles = kind === "image" ? pickImageFiles : pickVideoFiles;
    pickFiles((files) => {
      if (files.length === 0) return;
      if (kind === "image") insertImages(store, view, noteId, files, null);
      else insertVideos(store, view, noteId, files, null);
      view.focus();
    });
  }

  function insertVideoUrl(): void {
    const view = viewRef.current;
    setMediaLibraryKind(null);
    if (!view) return;
    insertMedia("video")(view.state, view.dispatch);
    view.focus();
  }

  /**
   * The emoji command re-opens the menu under its own trigger, so closing on the
   * way out would immediately hide the picker it just asked for.
   */
  function runSlashCommand(view: EditorView, command: SlashCommand): void {
    const menu = slashMenuRef.current;
    const action = applySlashCommand(view, command, menu.trigger);
    runSlashAction(view, action);
    if (action !== "open-emoji") setSlashMenu(closedSlashMenu);
  }

  /**
   * Escape closes the bubble menu and keeps it closed for the selection it was
   * opened on, so the menu does not pop straight back in on the next
   * transaction the way a plain close would.
   */
  function cancelBubbleMenu(view: EditorView): void {
    const { from, to } = view.state.selection;
    bubbleDismissedRef.current = { from, to };
    setBubbleMenu(closedBubbleMenu);
    view.focus();
  }

  /**
   * The range the link editor would act on: the selection, or the link under a
   * collapsed caret. Null when there is nothing to link, which is also what
   * lets `mod+k` fall through to the command palette.
   */
  function linkEditorRange(): { from: number; to: number; href: string } | null {
    const view = viewRef.current;
    if (!view) return null;
    const { selection } = view.state;
    const cursorLink = selection.empty ? linkAtCursor(view.state) : null;
    const from = cursorLink ? cursorLink.from : selection.from;
    const to = cursorLink ? cursorLink.to : selection.to;
    if (from === to) return null;
    return {
      from,
      to,
      href: cursorLink ? cursorLink.href : linkInRange(view.state, from, to),
    };
  }

  function openLinkEditor(): void {
    const view = viewRef.current;
    const range = linkEditorRange();
    if (!view || !range) return;
    setBubbleMenu(closedBubbleMenu);
    setLinkMenu({
      open: true,
      editing: true,
      href: range.href,
      from: range.from,
      to: range.to,
      ...linkMenuAnchor(view, range.from, range.to),
    });
  }

  const openLinkEditorRef = useRef(openLinkEditor);
  openLinkEditorRef.current = openLinkEditor;
  const linkEditorRangeRef = useRef(linkEditorRange);
  linkEditorRangeRef.current = linkEditorRange;

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

  const dismissJumpToLine = useCallback(() => {
    setJumpOpen(false);
  }, []);

const closeJumpToLine = useCallback(() => {
    dismissJumpToLine();
    viewRef.current?.focus();
  }, [dismissJumpToLine]);

  const getEditorSearchTarget = useCallback(() => getSearchTarget(), []);
  const search = useEditorSearch(store, getEditorSearchTarget, {
    onBeforeOpen: dismissJumpToLine,
  });
  const searchRef = useRef(search);
  searchRef.current = search;

  const toggleJumpToLine = useCallback(() => {
    if (jumpOpenRef.current) {
      closeJumpToLine();
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    search.resetSearch();
    const entry = activeEntry();
    const document = entry?.bounded ? entry.bounded.fullDocument() : view.state.doc;
    const index = buildDocumentLineIndex(document);
    jumpTargetRef.current = { document, index };
    setJumpLineCount(index.lineCount);
    const caretBlock = readSelection(view.state, entry?.bounded?.windowStart() ?? 0).blockIndex;
    setJumpCaretLine(index.blockStartLines[caretBlock] ?? 1);
    setJumpOpen(true);
    requestAnimationFrame(() => {
      jumpInputRef.current?.focus();
      jumpInputRef.current?.select();
    });
  }, [closeJumpToLine, search.resetSearch]);

  const commitJumpToLine = useCallback(() => {
    const target = jumpTargetRef.current;
    const view = viewRef.current;
    if (!target || !view) return;
    const line = parseJumpToLineInput(jumpValue, target.index.lineCount);
    if (line === null) return;
    const { blockIndex, offset } = documentLineTarget(target.document, target.index, line);
    setJumpOpen(false);
    const entry = activeEntry();
    const bounded = entry?.bounded;
    if (entry && bounded) {
      bounded.rememberSelection({ blockIndex, offset });
      bounded.revealBlock(blockIndex);
      installBoundedWindow(entry, true);
      const revealed = viewRef.current;
      if (revealed) revealed.dispatch(revealed.state.tr.scrollIntoView());
      return;
    }
    const position = topLevelTextPosition(view.state.doc, blockIndex, offset);
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, position))
        .scrollIntoView(),
    );
    view.focus();
  }, [jumpValue]);

  function handleJumpKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      commitJumpToLine();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeJumpToLine();
    }
  }

  const jumpToDocumentEdge = useCallback((edge: DocumentEdge) => {
    const view = viewRef.current;
    if (!view || activeIdRef.current === null) return;
    const entry = activeEntry();
    const bounded = entry?.bounded;
    if (entry && bounded) {
      moveBoundedWindow(
        entry,
        documentEdgeWindowStart(bounded.blockCount(), BOUNDED_BLOCK_LIMIT, edge),
      );
      bounded.rememberSelection(null);
    }
    view.dispatch(
      view.state.tr.setSelection(documentEdgeSelection(view.state.doc, edge)).scrollIntoView(),
    );
    view.focus();
  }, []);
  const editorShortcuts = useMemo<EditorBoundHandlersFor<NoteEditorShortcutId>>(
    () => ({
      goToDocumentStart: () => jumpToDocumentEdge("start"),
      goToDocumentEnd: () => jumpToDocumentEdge("end"),
      insertLink: {
        run: () => openLinkEditorRef.current(),
        claims: () => linkEditorRangeRef.current() !== null,
      },
      toggleChecklistItem: () => {
        const view = viewRef.current;
        if (view) toggleCheckItemAtSelection(view.state, view.dispatch);
      },
      jumpToLine: toggleJumpToLine,
    }),
    [jumpToDocumentEdge, toggleJumpToLine],
  );
  useEditorBoundShortcuts(store, shortcutHost, editorShortcuts);
  const overlayShortcuts = useMemo<EditorBoundHandlersFor<"jumpToLine">>(
    () => ({ jumpToLine: toggleJumpToLine }),
    [toggleJumpToLine],
  );
  useEditorBoundShortcuts(store, utilityOverlayHost, overlayShortcuts);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    function openTableMenu(
      currentView: EditorView,
      position: number,
      clientX: number,
      clientY: number,
    ): boolean {
      const block = topLevelBlockAt(currentView.state.doc, position);
      if (!block || block.node.type.name !== "table") return false;
      setBlockMenuPos(block.pos);
      blockMenuTriggerRef.current?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX, clientY }),
      );
      return true;
    }
    const referenceViews = createReferenceNodeViews(store);
    const imageViews = createImageNodeViews(store, (imageId, clientX, clientY) => {
      setImageMenuImageId(imageId);
      imageMenuTriggerRef.current?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX, clientY }),
      );
    });
    const view = new EditorView(host, {
      state: createEditorState(emptyDocument(), editorPlugins),
      editable: () => activeIdRef.current !== null,
      nodeViews: {
        ...referenceViews.nodeViews,
        ...imageViews.nodeViews,
        code_block: createCodeBlockNodeView,
        diagram: createDiagramNodeView,
        media: (node, currentView, getPos) =>
          createMediaNodeView(
            store,
            node,
            currentView,
            getPos,
            (src) => {
              openExternalUrl(src).catch((error) => {
                console.error("open external url rejected", error);
              });
            },
            (file, assignedId) => {
              const noteId = activeIdRef.current;
              if (noteId) {
                persistMediaFile(store, noteId, assignedId, file);
              }
            },
          ),
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
        const videos = collectVideoFiles(event.clipboardData);
        if (noteId && videos.length > 0) {
          event.preventDefault();
          return insertVideos(store, currentView, noteId, videos, null);
        }
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (linkPastedText(currentView, text)) {
          event.preventDefault();
          return true;
        }
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (pasteMarkdown(currentView, html, text, noteImageIds(store.getState(), noteId))) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleDrop(currentView, event, _slice, moved) {
        if (moved) return false;
        const noteId = activeIdRef.current;
        const files = collectImageFiles(event.dataTransfer);
        const videos = collectVideoFiles(event.dataTransfer);
        if (!noteId || (files.length === 0 && videos.length === 0)) return false;
        event.preventDefault();
        const drop = currentView.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertedImages = insertImages(store, currentView, noteId, files, drop?.pos ?? null);
        const insertedVideos = insertVideos(store, currentView, noteId, videos, drop?.pos ?? null);
        return insertedImages || insertedVideos;
      },
      handleKeyDown(currentView, event) {
        const entry = activeEntry();
        const bounded = entry?.bounded;
        const mod = event.metaKey || event.ctrlKey;
        if (
          isTableCommandAvailable(currentView.state) &&
          (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
        ) {
          event.preventDefault();
          const position = currentView.state.selection.from;
          const coords = currentView.coordsAtPos(position);
          return openTableMenu(currentView, position, coords.left, coords.bottom);
        }
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
        if (
          entry &&
          bounded &&
          !mod &&
          !event.altKey &&
          (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
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
        if (event.key === "Escape" && bubbleMenuRef.current.open) {
          event.preventDefault();
          cancelBubbleMenu(currentView);
          return true;
        }
        const menu = slashMenuRef.current;
        if (!menu.open) return false;
        if (event.key === "Escape") {
          slashDismissedRef.current = true;
          setSlashMenu(closedSlashMenu);
          return true;
        }
        const commands = filterSlashItems(menu.trigger, menu.query);
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
          if (command) runSlashCommand(currentView, command);
          else setSlashMenu(closedSlashMenu);
          return true;
        }
        return false;
      },
    });
    viewRef.current = view;
    const scrollHost = host.closest<HTMLElement>(".editor-scroll");
    scrollHostRef.current = scrollHost;
    const dragHandle = createDragHandle(view, {
      scrollHost,
      onInsert: (position) => {
        insertBlockAfter(position)(view.state, view.dispatch);
        view.dispatch(view.state.tr.insertText("/"));
        view.focus();
      },
      onMenu: (target: BlockMenuTarget) => {
        setBlockMenuPos(target.pos);
        blockMenuTriggerRef.current?.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, clientX: target.x, clientY: target.y }),
        );
      },
    });
    dragHandleRef.current = dragHandle;
    const handleScroll = () => {
      setBubbleMenu((previous) => (previous.open ? closedBubbleMenu : previous));
      setLinkMenu((previous) =>
        previous.open && !previous.editing ? closedLinkMenu : previous,
      );
      dragHandle.hide();
      const entry = activeEntry();
      if (!entry?.bounded || !scrollHost) return;
      if (dragHandle.isDragging()) return;
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
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("table")) return;
      const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!found) return;
      event.preventDefault();
      view.dispatch(
        view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(found.pos))),
      );
      openTableMenu(view, found.pos, event.clientX, event.clientY);
    };
    scrollHost?.addEventListener("scroll", handleScroll, { passive: true });
    view.dom.addEventListener("compositionstart", handleCompositionStart);
    view.dom.addEventListener("compositionend", handleCompositionEnd);
    view.dom.addEventListener("blur", handleBlur);
    view.dom.addEventListener("copy", handleCopy);
    view.dom.addEventListener("contextmenu", handleContextMenu);
    const unregisterPendingSave = registerPendingWork(() => flushPendingSave());
    return () => {
      unregisterPendingSave();
      void flushPendingSave().catch(reportBackgroundSaveFailure);
      scrollHost?.removeEventListener("scroll", handleScroll);
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("blur", handleBlur);
      view.dom.removeEventListener("copy", handleCopy);
      view.dom.removeEventListener("contextmenu", handleContextMenu);
      dragHandleRef.current = null;
      dragHandle.destroy();
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
    void flushPendingSave().catch(reportBackgroundSaveFailure);
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
    dragHandleRef.current?.hide();
    if (activeNoteId === null) {
      view.updateState(createEditorState(emptyDocument(), editorPlugins));
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
      view.updateState(createEditorState(emptyDocument(), editorPlugins));
      return;
    }
    let entry = cacheRef.current.get(activeNoteId);
    if (!entry || (entry.revision !== record.revision && !documentsEqual(
      entry.bounded?.fullDocument() ?? entry.state.doc,
      record.documentJson,
    ))) {
      entry = createCachedNote(record, preparedDocuments.documentFor(record), editorPlugins);
      cacheRef.current.set(activeNoteId, entry);
      pruneEditorWorkingSet();
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
        (state) => state.nodes,
        () => {
          const available = store.getState().nodes;
          const sequencer = saveSequencerRef.current!;
          const tracked = new Set([
            ...dirtyNoteIdsRef.current,
            ...sequencer.currentFailures().map(({ noteId }) => noteId),
          ]);
          for (const noteId of tracked) {
            if (available.has(noteId)) continue;
            dirtyNoteIdsRef.current.delete(noteId);
            sequencer.discard(noteId);
            if (activeIdRef.current === noteId && saveTimerRef.current !== null) {
              window.clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
          }
          pruneEditorWorkingSet();
        },
      ),
    [store],
  );

  useEffect(
    () =>
      store.subscribe(
        (state) => state.documents,
        () => {
          const id = activeIdRef.current;
          const record = id ? store.getState().documents.get(id) : undefined;
          const entry = id ? cacheRef.current.get(id) : undefined;
          if (!record || !entry) return;
          if (id && dirtyNoteIdsRef.current.has(id)) return;
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
            entry.state = createEditorState(replacement, editorPlugins);
            viewRef.current?.updateState(entry.state);
            syncBoundedSurface(entry);
          }
        },
      ),
    [store],
  );

  const slashItems = slashMenu.open ? filterSlashItems(slashMenu.trigger, slashMenu.query) : [];
  const editorPane = shortcutHost?.closest<HTMLElement>(".editor-pane") ?? null;
  const utilityMode = jumpOpen ? "jump" : search.searchOpen ? "search" : null;

  function runBlockCommand(build: (position: number) => Command): void {
    const view = viewRef.current;
    if (!view || blockMenuPos === null) return;
    build(blockMenuPos)(view.state, view.dispatch);
    view.focus();
  }

  function runTableCommand(entry: TableCommand): void {
    const view = viewRef.current;
    if (!view || blockMenuPos === null) return;
    if (!isTableCommandAvailable(view.state)) {
      const cellPosition = firstTableCellTextPosition(view.state, blockMenuPos);
      if (cellPosition === null) return;
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPosition)),
      );
    }
    entry.command(view.state, view.dispatch);
    view.focus();
  }

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

  const blockMenuIsTable =
    blockMenuPos !== null &&
    viewRef.current?.state.doc.nodeAt(blockMenuPos)?.type.name === "table";

  return (
    <div className="editor-host">
      {failedSaveNoteIds.size > 0 && (
        <div
          className="sticky top-3 z-40 mx-auto mb-3 flex max-w-xl items-center justify-between gap-4 rounded-[var(--radius)] border border-[hsl(var(--mood-rough)/0.45)] bg-popover px-3 py-2 text-[13px] shadow-sm"
          role="alert"
        >
          <span>
            {failedSaveNoteIds.size === 1
              ? "Changes couldn’t be saved. Your draft is still here."
              : `Changes in ${failedSaveNoteIds.size} notes couldn’t be saved. Your drafts are still here.`}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-[var(--radius)] border border-border bg-muted/55 px-2 py-1 text-[12px] font-[560] hover:bg-muted"
            onClick={() => {
              void Promise.all([...failedSaveNoteIds].map((noteId) => saveNow(noteId)))
                .catch(reportBackgroundSaveFailure);
            }}
          >
            Retry save
          </button>
        </div>
      )}
      {utilityMode && editorPane
        ? createPortal(
            <motion.div
              ref={setUtilityOverlayHost}
              layout={reduceUtilityMotion ? false : "size"}
              transition={
                reduceUtilityMotion
                  ? REDUCED_UTILITY_LAYOUT_TRANSITION
                  : UTILITY_LAYOUT_TRANSITION
              }
              data-editor-utility-overlay
              data-mode={utilityMode}
              className={`@container/editor-search absolute right-3 top-3 z-40 origin-top-right overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-[13px] text-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)] ${
                utilityMode === "search"
                  ? "w-[min(420px,calc(100%_-_1.5rem))]"
                  : "w-fit pl-2.5"
              }`}
            >
              {utilityMode === "jump" ? (
                <JumpToLinePanel
                  fieldId={jumpFieldId}
                  inputRef={jumpInputRef}
                  value={jumpValue}
                  onValueChange={setJumpValue}
                  onKeyDown={handleJumpKeyDown}
                  onBlur={() => setJumpOpen(false)}
                  lineCount={jumpLineCount}
                  placeholder={String(jumpCaretLine)}
                />
              ) : (
                <SearchWidget
                  ref={search.findInputRef}
                  optionHints={search.optionHints}
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
              )}
            </motion.div>,
            editorPane,
          )
        : null}
      <div ref={beforeSpacerRef} className="bounded-editor-spacer" aria-hidden="true" />
      <div
        ref={attachShortcutHost}
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
        onCancel={() => {
          const view = viewRef.current;
          if (view) cancelBubbleMenu(view);
        }}
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
          aria-label={slashMenu.trigger === ":" ? "Insert emoji" : "Insert block"}
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
                    if (view) runSlashCommand(view, command);
                    else setSlashMenu(closedSlashMenu);
                  }}
                >
                  <span
                    className={
                      slashMenu.trigger === ":" ? "slash-menu-icon is-emoji" : "slash-menu-icon"
                    }
                    aria-hidden="true"
                  >
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
          <span ref={blockMenuTriggerRef} aria-hidden="true" className="fixed left-0 top-0 h-0 w-0" />
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-48"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            viewRef.current?.focus();
          }}
        >
          {blockMenuIsTable ? (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Table</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  {tableCommands.map((entry, index) => (
                    <Fragment key={entry.id}>
                      {(index === 3 || index === 6 || index === 7) ? (
                        <ContextMenuSeparator />
                      ) : null}
                      <ContextMenuItem onSelect={() => runTableCommand(entry)}>
                        {entry.label}
                      </ContextMenuItem>
                    </Fragment>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          ) : null}
          <ContextMenuItem className="gap-2" onSelect={() => runBlockCommand(duplicateBlock)}>
            <CopyIcon size={14} />
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => runBlockCommand((position) => moveBlock(position, -1))}
          >
            <ArrowUpIcon size={14} />
            Move up
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2"
            onSelect={() => runBlockCommand((position) => moveBlock(position, 1))}
          >
            <ArrowDownIcon size={14} />
            Move down
          </ContextMenuItem>
          <ContextMenuItem className="gap-2" onSelect={() => runBlockCommand(deleteBlock)}>
            <Trash2Icon size={14} />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
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
      {mediaLibraryKind !== null && (
        <MediaLibraryPicker
          open
          kind={mediaLibraryKind}
          onOpenChange={(open) => {
            if (!open) setMediaLibraryKind(null);
          }}
          onSelect={selectLibraryMedia}
          onUpload={uploadLibraryMedia}
          onUseUrl={mediaLibraryKind === "video" ? insertVideoUrl : undefined}
        />
      )}
    </div>
  );
}
