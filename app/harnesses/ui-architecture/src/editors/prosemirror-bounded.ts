import type { Node as ProseMirrorNode } from "prosemirror-model";
import {
  EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";

import { BOUNDED_BLOCK_LIMIT, createBoundedCorpus } from "../corpus";
import { createBoundedEditorProjection } from "./bounded-correctness";
import {
  createProductPlugins,
  createProductCanonicalBlocks,
  productSchema,
  slashMenuState,
} from "./prosemirror-product";
import type {
  BlockCount,
  BoundedEditorSnapshot,
  BoundedSelection,
  CanonicalBlock,
  CanonicalNode,
  EditorCandidate,
  PreparedState,
} from "../types";

function toNode(block: CanonicalBlock): ProseMirrorNode {
  if (block.node) return productSchema.nodeFromJSON(block.node);
  const text = block.text.length > 0 ? productSchema.text(block.text) : undefined;
  if (block.kind === "heading") {
    return productSchema.node("heading", { level: 2 }, text);
  }
  const paragraph = productSchema.node("paragraph", null, text);
  if (block.kind === "quote") {
    return productSchema.node("blockquote", null, paragraph);
  }
  return paragraph;
}

function createView(
  host: HTMLElement,
  state: EditorState,
  dispatch: (view: EditorView, transaction: Transaction) => void,
): EditorView {
  let mountedView: EditorView;
  mountedView = new EditorView(
    { mount: host },
    {
      state,
      dispatchTransaction(transaction) {
        dispatch(mountedView, transaction);
      },
    },
  );
  return mountedView;
}

type Projection = ReturnType<typeof createBoundedEditorProjection>;

type BoundedDocument = {
  projection: Projection;
  state: EditorState;
  history: CanonicalHistoryEntry[];
  redo: CanonicalHistoryEntry[];
};

type CanonicalHistoryEntry = {
  start: number;
  before: CanonicalBlock[];
  after: CanonicalBlock[];
  afterCount: number;
};

function createState(
  blocks: readonly CanonicalBlock[],
  undoBoundary?: () => boolean,
  redoBoundary?: () => boolean,
): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, blocks.map(toNode)),
    plugins: createProductPlugins({
      undo: undoBoundary ? () => undoBoundary() : undefined,
      redo: redoBoundary ? () => redoBoundary() : undefined,
    }),
  });
}

function blockKind(node: ProseMirrorNode): CanonicalBlock["kind"] {
  if (node.type.name === "heading") return "heading";
  if (node.type.name === "blockquote") return "quote";
  return "paragraph";
}

function fromNode(node: ProseMirrorNode): CanonicalBlock {
  return {
    kind: blockKind(node),
    text: node.textContent,
    node: node.toJSON() as CanonicalNode,
  };
}

function replaceFirstText(node: CanonicalNode, text: string): [CanonicalNode, boolean] {
  if (node.type === "text") return [{ ...node, text }, true];
  if (!node.content) return [node, false];
  let replaced = false;
  const content = node.content.map((child) => {
    if (replaced) return child;
    const [next, didReplace] = replaceFirstText(child, text);
    replaced = didReplace;
    return next;
  });
  return [{ ...node, content }, replaced];
}

function replaceBlockText(block: CanonicalBlock, text: string): CanonicalBlock {
  if (!block.node) return { ...block, text };
  const [json, replaced] = replaceFirstText(block.node, text);
  if (!replaced) throw new Error("cannot replace text in a non-text canonical block");
  const node = productSchema.nodeFromJSON(json);
  return fromNode(node);
}

function blocksEqual(left: CanonicalBlock, right: CanonicalBlock): boolean {
  return JSON.stringify(left.node) === JSON.stringify(right.node);
}

function createHistoryEntry(
  windowStart: number,
  before: readonly CanonicalBlock[],
  after: readonly CanonicalBlock[],
): CanonicalHistoryEntry | null {
  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    blocksEqual(before[prefix] as CanonicalBlock, after[prefix] as CanonicalBlock)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    blocksEqual(
      before[before.length - suffix - 1] as CanonicalBlock,
      after[after.length - suffix - 1] as CanonicalBlock,
    )
  ) {
    suffix += 1;
  }
  const beforeEnd = before.length - suffix;
  const afterCount = after.length - prefix - suffix;
  if (prefix === before.length && prefix === after.length) return null;
  return {
    start: windowStart + prefix,
    before: before.slice(prefix, beforeEnd),
    after: after.slice(prefix, after.length - suffix),
    afterCount,
  };
}

function textStartAt(doc: ProseMirrorNode, blockIndex: number): number {
  let position = 0;
  for (let index = 0; index < blockIndex; index += 1) {
    position += doc.child(index).nodeSize;
  }
  let node = doc.child(blockIndex);
  while (!node.isTextblock && node.childCount > 0) {
    position += 1;
    node = node.child(0);
  }
  return position + 1;
}

function selectionPosition(
  doc: ProseMirrorNode,
  windowStart: number,
  selection: BoundedSelection,
): number {
  const blockIndex = Math.min(
    Math.max(0, selection.blockIndex - windowStart),
    Math.max(0, doc.childCount - 1),
  );
  const block = doc.child(blockIndex);
  return (
    textStartAt(doc, blockIndex) +
    Math.min(selection.offset, block.textContent.length)
  );
}

function readSelection(
  state: EditorState,
  windowStart: number,
): BoundedSelection {
  return {
    blockIndex: windowStart + state.selection.$from.index(0),
    offset: state.selection.$from.parentOffset,
  };
}

function countDomNodes(view: EditorView | null): number {
  return view ? view.dom.querySelectorAll("*").length + 1 : 0;
}

export function createProseMirrorBoundedCandidate(): EditorCandidate {
  let view: EditorView | null = null;
  let mountedHost: HTMLElement | null = null;
  const documents = new Map<string, BoundedDocument>();
  let activeId: string | null = null;
  let composing = false;
  let preparations = 0;
  let mounts = 0;

  function createDocumentState(blocks: readonly CanonicalBlock[]): EditorState {
    return createState(blocks, undo, redo);
  }

  function activeDocument(): BoundedDocument {
    const document = activeId ? documents.get(activeId) : null;
    if (!document) {
      throw new Error("bounded editor has no active document");
    }
    return document;
  }

  function restoreSelection(document: BoundedDocument): void {
    if (!view) return;
    const window = document.projection.getWindow();
    if (window.focused && window.selection) {
      const position = selectionPosition(view.state.doc, window.start, window.selection);
      view.updateState(
        view.state.apply(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, position)),
        ),
      );
      document.state = view.state;
      view.focus();
    }
    if (mountedHost) {
      mountedHost.scrollTop = window.scrollTop;
    }
  }

  function installDocument(document: BoundedDocument): void {
    view?.updateState(document.state);
    restoreSelection(document);
  }

  function syncTransaction(
    nextView: EditorView,
    transaction: Transaction,
  ): void {
    const document = activeDocument();
    const nextState = nextView.state.apply(transaction);
    document.state = nextState;
    nextView.updateState(nextState);
    const window = document.projection.getWindow();
    if (nextView.hasFocus()) {
      document.projection.focus(readSelection(nextState, window.start));
    } else {
      document.projection.blur();
    }
    if (!transaction.docChanged) return;
    const rendered = document.projection.getRenderedBlocks();
    const nextBlocks: CanonicalBlock[] = [];
    nextState.doc.forEach((node) => nextBlocks.push(fromNode(node)));
    const historyEntry = createHistoryEntry(window.start, rendered, nextBlocks);
    if (!historyEntry) return;
    document.projection.replaceRenderedBlocks(nextBlocks);
    document.history.push(historyEntry);
    document.redo = [];
  }

  function snapshot(): BoundedEditorSnapshot {
    const document = activeDocument();
    const window = document.projection.getWindow();
    const currentState = view?.state ?? document.state;
    const slashMenu = slashMenuState(currentState);
    return {
      noteId: activeId ?? "",
      ...window,
      domSelection: view ? readSelection(view.state, window.start) : null,
      selectionTop: view ? view.coordsAtPos(view.state.selection.from).top : null,
      domFocused: view?.hasFocus() ?? false,
      renderedTexts: document.projection.getRenderedBlocks().map((block) => block.text),
      canonicalTexts: document.projection.getCanonicalBlocks().map((block) => block.text),
      renderedNodes: document.projection.getRenderedBlocks().map((block) => block.node ?? null),
      canonicalNodes: document.projection.getCanonicalBlocks().map((block) => block.node ?? null),
      composing,
      undoDepth: document.history.length,
      undoRetainedBlocks: document.history.reduce(
        (total, entry) => total + entry.before.length,
        0,
      ),
      redoDepth: document.redo.length,
      redoRetainedBlocks: document.redo.reduce(
        (total, entry) => total + entry.after.length,
        0,
      ),
      slashMenuOpen: slashMenu.open,
      slashMenuQuery: slashMenu.query,
    };
  }

  function focus(selection: BoundedSelection): void {
    const document = activeDocument();
    const window = document.projection.getWindow();
    if (selection.blockIndex < window.start || selection.blockIndex >= window.end) {
      throw new Error("cannot focus a block outside the rendered window");
    }
    document.projection.focus(selection);
    restoreSelection(document);
  }

  function moveWindow(start: number): void {
    if (composing) {
      throw new Error("cannot move the bounded window during IME composition");
    }
    const document = activeDocument();
    const anchorTop = view?.hasFocus()
      ? view.coordsAtPos(view.state.selection.from).top
      : null;
    if (view && mountedHost) {
      const window = document.projection.getWindow();
      document.projection.setScrollTop(mountedHost.scrollTop);
      if (view.hasFocus()) {
        document.projection.focus(readSelection(view.state, window.start));
      } else {
        document.projection.blur();
      }
    }
    document.projection.moveWindow(start);
    document.state = createDocumentState(document.projection.getRenderedBlocks());
    installDocument(document);
    if (view && mountedHost && anchorTop !== null) {
      const movedTop = view.coordsAtPos(view.state.selection.from).top;
      mountedHost.scrollTop = Math.max(0, mountedHost.scrollTop + movedTop - anchorTop);
      document.projection.setScrollTop(mountedHost.scrollTop);
    }
  }

  function reconcileCanonical(edit: { blockIndex: number; text: string }): void {
    const document = activeDocument();
    const block = document.projection.getCanonicalBlocks()[edit.blockIndex];
    if (!block) throw new Error("unknown canonical block");
    document.projection.replaceCanonicalRange(
      edit.blockIndex,
      1,
      [replaceBlockText(block, edit.text)],
    );
    const window = document.projection.getWindow();
    if (edit.blockIndex < window.start || edit.blockIndex >= window.end) return;
    document.state = createDocumentState(document.projection.getRenderedBlocks());
    installDocument(document);
  }

  function insertText(text: string): void {
    if (!view) throw new Error("bounded editor is not mounted");
    view.dispatch(view.state.tr.insertText(text));
  }

  function undo(): boolean {
    const document = activeDocument();
    const entry = document.history.pop();
    if (!entry) return false;
    document.projection.replaceCanonicalRange(entry.start, entry.afterCount, entry.before);
    document.redo.push(entry);
    const maximumStart = Math.max(
      0,
      document.projection.getCanonicalBlocks().length - BOUNDED_BLOCK_LIMIT,
    );
    document.projection.moveWindow(Math.min(entry.start, maximumStart));
    document.state = createDocumentState(document.projection.getRenderedBlocks());
    installDocument(document);
    return true;
  }

  function redo(): boolean {
    const document = activeDocument();
    const entry = document.redo.pop();
    if (!entry) return false;
    document.projection.replaceCanonicalRange(entry.start, entry.before.length, entry.after);
    document.history.push(entry);
    const maximumStart = Math.max(
      0,
      document.projection.getCanonicalBlocks().length - BOUNDED_BLOCK_LIMIT,
    );
    document.projection.moveWindow(Math.min(entry.start, maximumStart));
    document.state = createDocumentState(document.projection.getRenderedBlocks());
    installDocument(document);
    return true;
  }

  function handleCompositionStart(): void {
    composing = true;
  }

  function handleCompositionEnd(): void {
    composing = false;
  }

  const candidate: EditorCandidate = {
    id: "prosemirror",
    label: "ProseMirror bounded window",
    strategy: "bounded",
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      documents.clear();
      return Array.from({ length: noteCount }, (_, noteIndex) => {
        const corpus = createBoundedCorpus(blockCount, noteIndex);
        const canonical = createProductCanonicalBlocks(corpus.canonical);
        const id = `prosemirror-bounded-${blockCount}-${noteIndex}`;
        const projection = createBoundedEditorProjection(
          canonical,
          BOUNDED_BLOCK_LIMIT,
        );
        projection.moveWindow(corpus.start);
        const state = createDocumentState(projection.getRenderedBlocks());
        documents.set(id, { projection, state, history: [], redo: [] });
        return {
          id,
          value: state,
          canonicalBlockCount: canonical.length,
          renderedBlockCount: corpus.rendered.length,
          windowStart: corpus.start,
          windowEnd: corpus.end,
        };
      });
    },
    mount(
      host: HTMLElement,
      _states: readonly PreparedState[],
      initial: PreparedState,
    ) {
      mounts += 1;
      mountedHost = host;
      activeId = initial.id;
      const document = activeDocument();
      view = createView(host, document.state, syncTransaction);
      host.addEventListener("compositionstart", handleCompositionStart);
      host.addEventListener("compositionend", handleCompositionEnd);
    },
    install(state: PreparedState) {
      if (view && mountedHost && activeId) {
        const current = activeDocument();
        const window = current.projection.getWindow();
        current.state = view.state;
        current.projection.setScrollTop(mountedHost.scrollTop);
        if (view.hasFocus()) {
          current.projection.focus(readSelection(view.state, window.start));
        } else {
          current.projection.blur();
        }
      }
      activeId = state.id;
      installDocument(activeDocument());
    },
    edit(sampleIndex: number) {
      insertText(String(sampleIndex % 10));
    },
    preparationCount() {
      return preparations;
    },
    mountCount() {
      return mounts;
    },
    editorInstanceCount() {
      return Number(view !== null);
    },
    activeDomNodeCount() {
      return countDomNodes(view);
    },
    totalDomNodeCount() {
      return countDomNodes(view);
    },
    layoutHeight() {
      return mountedHost?.offsetHeight ?? 0;
    },
    boundedControl: {
      snapshot,
      focus,
      moveWindow,
      reconcileCanonical,
      insertText,
      undo,
      redo,
    },
    destroy() {
      mountedHost?.removeEventListener("compositionstart", handleCompositionStart);
      mountedHost?.removeEventListener("compositionend", handleCompositionEnd);
      view?.destroy();
      view = null;
      mountedHost = null;
      activeId = null;
      composing = false;
      documents.clear();
    },
  };

  return candidate;
}
