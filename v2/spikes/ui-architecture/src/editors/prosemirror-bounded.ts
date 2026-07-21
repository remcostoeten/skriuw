import type { Node as ProseMirrorNode } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";

import { createBoundedCorpus } from "../corpus";
import type {
  BlockCount,
  CanonicalBlock,
  EditorCandidate,
  PreparedState,
} from "../types";

function toNode(block: CanonicalBlock): ProseMirrorNode {
  const text = schema.text(block.text);
  if (block.kind === "heading") {
    return schema.node("heading", { level: 2 }, text);
  }
  const paragraph = schema.node("paragraph", null, text);
  if (block.kind === "quote") {
    return schema.node("blockquote", null, paragraph);
  }
  return paragraph;
}

function asState(state: PreparedState): EditorState {
  return state.value as EditorState;
}

function createView(host: HTMLElement, state: EditorState): EditorView {
  let mountedView: EditorView;
  mountedView = new EditorView(
    { mount: host },
    {
      state,
      dispatchTransaction(transaction) {
        mountedView.updateState(mountedView.state.apply(transaction));
      },
    },
  );
  return mountedView;
}

function countDomNodes(view: EditorView | null): number {
  return view ? view.dom.querySelectorAll("*").length + 1 : 0;
}

export function createProseMirrorBoundedCandidate(): EditorCandidate {
  let view: EditorView | null = null;
  let mountedHost: HTMLElement | null = null;
  const canonicalDocuments = new Map<string, readonly CanonicalBlock[]>();
  let preparations = 0;
  let mounts = 0;

  return {
    id: "prosemirror",
    label: "ProseMirror bounded window",
    strategy: "bounded",
    prepare(blockCount: BlockCount, noteCount: number) {
      preparations += 1;
      canonicalDocuments.clear();
      return Array.from({ length: noteCount }, (_, noteIndex) => {
        const corpus = createBoundedCorpus(blockCount, noteIndex);
        const id = `prosemirror-bounded-${blockCount}-${noteIndex}`;
        const doc = schema.node("doc", null, corpus.rendered.map(toNode));
        canonicalDocuments.set(id, corpus.canonical);
        return {
          id,
          value: EditorState.create({ doc }),
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
      view = createView(host, asState(initial));
    },
    install(state: PreparedState) {
      view?.updateState(asState(state));
    },
    edit(sampleIndex: number) {
      if (view) {
        view.dispatch(view.state.tr.insertText(String(sampleIndex % 10), 1));
      }
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
    destroy() {
      view?.destroy();
      view = null;
      mountedHost = null;
      canonicalDocuments.clear();
    },
  };
}
