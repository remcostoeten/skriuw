import type { Node as ProseMirrorNode } from "prosemirror-model";
import { undo as undoCommand, undoDepth } from "prosemirror-history";
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
  productSchema,
  slashMenuState,
} from "./prosemirror-product";
import type {
  BlockCount,
  BoundedEditorSnapshot,
  BoundedSelection,
  CanonicalBlock,
  EditorCandidate,
  PreparedState,
} from "../types";

function toNode(block: CanonicalBlock): ProseMirrorNode {
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
};

function createState(blocks: readonly CanonicalBlock[]): EditorState {
  return EditorState.create({
    doc: productSchema.node("doc", null, blocks.map(toNode)),
    plugins: createProductPlugins(),
  });
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
    nextState.doc.forEach((node, _offset, index) => {
      if (rendered[index]?.text === node.textContent) return;
      document.projection.applyEditorEdit({
        blockIndex: window.start + index,
        text: node.textContent,
      });
    });
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
      composing,
      undoDepth: undoDepth(currentState),
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
    document.state = createState(document.projection.getRenderedBlocks());
    installDocument(document);
    if (view && mountedHost && anchorTop !== null) {
      const movedTop = view.coordsAtPos(view.state.selection.from).top;
      mountedHost.scrollTop = Math.max(0, mountedHost.scrollTop + movedTop - anchorTop);
      document.projection.setScrollTop(mountedHost.scrollTop);
    }
  }

  function reconcileCanonical(edit: { blockIndex: number; text: string }): void {
    const document = activeDocument();
    document.projection.reconcileCanonical(edit);
    const window = document.projection.getWindow();
    if (edit.blockIndex < window.start || edit.blockIndex >= window.end) return;
    document.state = createState(document.projection.getRenderedBlocks());
    installDocument(document);
  }

  function insertText(text: string): void {
    if (!view) throw new Error("bounded editor is not mounted");
    view.dispatch(view.state.tr.insertText(text));
  }

  function undo(): boolean {
    if (!view) return false;
    return undoCommand(view.state, view.dispatch);
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
        const id = `prosemirror-bounded-${blockCount}-${noteIndex}`;
        const projection = createBoundedEditorProjection(
          corpus.canonical,
          BOUNDED_BLOCK_LIMIT,
        );
        projection.moveWindow(corpus.start);
        const state = createState(projection.getRenderedBlocks());
        documents.set(id, { projection, state });
        return {
          id,
          value: state,
          canonicalBlockCount: corpus.canonical.length,
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
